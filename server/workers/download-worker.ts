import { Job, Worker } from 'bullmq'
import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import AdmZip from 'adm-zip'
import { getRedis } from '../utils/redis'
import { notifySession } from '../utils/wsManager'
import type { DownloadJobDataType, DownloadJobReturnType, WorkerProgress } from '~~/shared/types/workers'
import type { DataProvider } from '~~/shared/types/url'
import {
    buildProviderAccessUrl,
    buildProviderDownloadUrl,
    getProviderDownloadBaseUrl,
    getProviderBaseUrl
} from '~~/shared/types/url'
import { queuePreviousFilesForStop } from '../utils/files'
import { extractFromCroissant, extractFromDcat, extractFromZenodo } from '../utils/schema-extractor'
import type { ExtractedMetadata } from '~~/shared/types/workers'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const redis = getRedis()
const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024
const MAX_SCHEMA_BYTES = 0.2 * 1024 * 1024
const PROGRESS_UNK_BYTES_STEP = 5 * 1024 * 1024

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ZenodoFile = { name: string; url: string; size: number }

type DownloadPlan =
    | { kind: 'archive'; url: string; headers: Record<string, string>; downloadUrl: string }
    | { kind: 'files'; files: ZenodoFile[]; headers: Record<string, string>; downloadUrl: string }

type ResolvedPlan = {
    plan: DownloadPlan
    accessUrl: string
    providerBaseUrl?: string
    schemaCandidates?: { type: 'croissant' | 'dcat' | 'zenodo'; urls: string[]; headers: Record<string, string>; payload?: any }[]
}

// ---------------------------------------------------------------------------
// Fetch utilities
// ---------------------------------------------------------------------------

async function fetchOk(url: string, headers: Record<string, string>, options?: RequestInit): Promise<Response> {
    const response = await fetch(url, { redirect: 'follow', headers, ...options })
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`)
    return response
}

async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
    const response = await fetchOk(url, headers)
    return response.json() as Promise<T>
}

async function fetchTextWithLimit(url: string, headers: Record<string, string>, maxBytes: number): Promise<string> {
    const response = await fetchOk(url, headers)
    const contentLength = Number(response.headers.get('content-length')) || 0
    if (contentLength > maxBytes) throw new Error('Schema exceeds size limit')
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength > maxBytes) throw new Error('Schema exceeds size limit')
    return buffer.toString('utf8')
}

// ---------------------------------------------------------------------------
// Plan resolution
// ---------------------------------------------------------------------------

type RuntimeConfig = ReturnType<typeof useRuntimeConfig>

async function resolvePlan(
    provider: DataProvider,
    identifier: string,
    sourceUrl: string,
    config: RuntimeConfig
): Promise<ResolvedPlan> {
    switch (provider) {
        case 'GitHub': {
            const BASE_HEADERS = { 'User-Agent': 'dcatextract' }
            const repo = await fetchJson<{ default_branch?: string }>(
                `https://api.github.com/repos/${identifier}`,
                BASE_HEADERS
            )
            const branch = repo.default_branch === 'master' ? 'master' : 'main'
            const url = buildProviderDownloadUrl('GitHub', identifier, branch)
            if (!url) throw new Error('Failed to build GitHub download URL')
            return {
                plan: { kind: 'archive', url, headers: BASE_HEADERS, downloadUrl: url },
                accessUrl: buildProviderAccessUrl('GitHub', identifier, sourceUrl) ?? sourceUrl,
                providerBaseUrl: getProviderBaseUrl('GitHub') ?? undefined
            }
        }

        case 'HuggingFace': {
            const headers: Record<string, string> = { 'User-Agent': 'dcatextract' }
            if (config.huggingFaceToken) headers.Authorization = `Bearer ${config.huggingFaceToken}`

            for (const branch of ['main', 'master'] as const) {
                const url = buildProviderDownloadUrl('HuggingFace', identifier, branch)
                if (!url) throw new Error('Failed to build Hugging Face download URL')
                return {
                    plan: { kind: 'archive', url, headers, downloadUrl: url },
                    accessUrl: buildProviderAccessUrl('HuggingFace', identifier, sourceUrl) ?? sourceUrl,
                    providerBaseUrl: getProviderBaseUrl('HuggingFace') ?? undefined,
                    schemaCandidates: [{
                        type: 'croissant',
                        headers,
                        urls: [
                            `https://huggingface.co/datasets/${identifier}/resolve/${branch}/croissant.json`,
                            `https://huggingface.co/datasets/${identifier}/raw/${branch}/croissant.json`
                        ]
                    }]
                }
            }
            throw new Error('Failed to resolve Hugging Face dataset archive')
        }

        case 'Kaggle': {
            const headers: Record<string, string> = { 'User-Agent': 'dcatextract' }
            const { kaggleUsername: username, kaggleKey: key } = config
            if (username && key) headers.Authorization = `Basic ${Buffer.from(`${username}:${key}`).toString('base64')}`
            const url = buildProviderDownloadUrl('Kaggle', identifier)
            if (!url) throw new Error('Failed to build Kaggle download URL')
            return {
                plan: { kind: 'archive', url, headers, downloadUrl: url },
                accessUrl: buildProviderAccessUrl('Kaggle', identifier, sourceUrl) ?? sourceUrl,
                providerBaseUrl: getProviderBaseUrl('Kaggle') ?? undefined,
                schemaCandidates: [{
                    type: 'croissant',
                    headers,
                    urls: [
                        `https://www.kaggle.com/datasets/${identifier}/croissant/download`
                    ]
                }]
            }
        }

        case 'Zenodo': {
            const headers = { 'User-Agent': 'dcatextract' }
            const dcatHeaders = { ...headers, Accept: 'text/turtle,application/ld+json,application/rdf+xml;q=0.9,*/*;q=0.8' }

            // Always fetch metadata payload first for schema extraction
            console.log(`[zenodo] Fetching metadata for record ${identifier}`)
            let metadataPayload: any = undefined
            try {
                metadataPayload = await fetchJson<any>(`https://zenodo.org/api/records/${identifier}`, headers)
                console.log(`[zenodo] Metadata payload fetched successfully`)
            } catch (err) {
                console.log(`[zenodo] Failed to fetch metadata payload: ${err instanceof Error ? err.message : String(err)}`)
            }

            // Try InvenioRDM files endpoint first (new Zenodo)
            console.log(`[zenodo] Trying new /api/records/{id}/files endpoint`)
            const filesRes = await fetch(`https://zenodo.org/api/records/${identifier}/files`, { headers })
            if (filesRes.ok) {
                const payload = await filesRes.json() as {
                    entries?: Array<{ key?: string; links?: { content?: string }; size?: number }>
                }
                const files: ZenodoFile[] = (payload.entries ?? [])
                    .map(f => ({ name: f.key ?? '', url: f.links?.content ?? '', size: f.size ?? 0 }))
                    .filter(f => f.name && f.url)
                if (files.length > 0) {
                    console.log(`[zenodo] Found ${files.length} files via new endpoint`)
                    return {
                        plan: { kind: 'files', files, headers, downloadUrl: `https://zenodo.org/api/records/${identifier}/files` },
                        accessUrl: buildProviderAccessUrl('Zenodo', identifier, sourceUrl) ?? sourceUrl,
                        providerBaseUrl: getProviderBaseUrl('Zenodo') ?? undefined,
                        schemaCandidates: [
                            ...(metadataPayload ? [{
                                type: 'zenodo' as const,
                                headers: dcatHeaders,
                                urls: [],
                                payload: metadataPayload
                            }] : []),
                            {
                                type: 'dcat' as const,
                                headers: dcatHeaders,
                                urls: [
                                    `https://zenodo.org/records/${identifier}/export/dcat`,
                                    `https://zenodo.org/records/${identifier}/export/dcat-ap`,
                                    `https://zenodo.org/api/records/${identifier}?format=dcat`
                                ]
                            }
                        ]
                    }
                }
                console.log(`[zenodo] New endpoint returned no files, trying fallback`)
            }

            // Fall back to legacy API
            if (!metadataPayload) {
                console.log(`[zenodo] Trying legacy /api/records/{id} endpoint`)
                metadataPayload = await fetchJson<any>(`https://zenodo.org/api/records/${identifier}`, headers)
            }

            const files: ZenodoFile[] = (metadataPayload.files ?? [])
                .map((f: any) => ({ name: f.key ?? '', url: f.links?.download ?? '', size: f.size ?? 0 }))
                .filter((f: any) => f.name && f.url)
            if (files.length === 0) throw new Error('Zenodo record has no downloadable files')
            console.log(`[zenodo] Found ${files.length} files via legacy endpoint`)

            // Extract metadata from Zenodo JSON payload and DCAT export
            return {
                plan: { kind: 'files', files, headers, downloadUrl: `https://zenodo.org/api/records/${identifier}` },
                accessUrl: buildProviderAccessUrl('Zenodo', identifier, sourceUrl) ?? sourceUrl,
                providerBaseUrl: getProviderBaseUrl('Zenodo') ?? undefined,
                schemaCandidates: [
                    {
                        type: 'zenodo',
                        headers: dcatHeaders,
                        urls: [],
                        payload: metadataPayload
                    } as any,
                    {
                        type: 'dcat',
                        headers: dcatHeaders,
                        urls: [
                            `https://zenodo.org/records/${identifier}/export/dcat`,
                            `https://zenodo.org/records/${identifier}/export/dcat-ap`,
                            `https://zenodo.org/api/records/${identifier}?format=dcat`
                        ]
                    }
                ]
            }
        }

        default:
            throw new Error(`Provider ${provider} not supported for download yet`)
    }
}

// ---------------------------------------------------------------------------
// Progress reporter
// ---------------------------------------------------------------------------

class ProgressReporter {
    private downloaded = 0
    private lastReported = -1
    private totalBytes = 0

    constructor(
        private readonly job: Job<DownloadJobDataType, DownloadJobReturnType>,
        private readonly sessionId: string
    ) {}

    async report(progress: number, message: string) {
        await this.job.updateProgress({ progress, message } as WorkerProgress)
        notifySession(this.sessionId, { type: 'download-progress', progress, message, downloadedBytes: this.downloaded, totalBytes: this.totalBytes })
    }

    setTotalBytes(bytes: number) { this.totalBytes = bytes }
    getTotalBytes() { return this.totalBytes }
    getDownloaded() { return this.downloaded }

    trackChunk(chunkSize: number, stream: Readable) {
        this.downloaded += chunkSize
        if (this.downloaded > MAX_DOWNLOAD_BYTES) {
            stream.destroy(new Error('Dataset exceeds 2GB limit'))
            return
        }
        if (this.totalBytes > 0) {
            const pct = Math.min(99, Math.floor((this.downloaded / this.totalBytes) * 100))
            if (pct !== this.lastReported) {
                this.lastReported = pct
                this.report(pct, `Downloading dataset... (${formatBytes(this.downloaded)} / ${formatBytes(this.totalBytes)})`).catch(() => undefined)
            }
        } else if (this.downloaded - this.lastReported > PROGRESS_UNK_BYTES_STEP) {
            this.lastReported = this.downloaded
            this.report(0, `Downloading dataset... (${formatBytes(this.downloaded)})`).catch(() => undefined)
        }
    }
}

// ---------------------------------------------------------------------------
// Download / extract
// ---------------------------------------------------------------------------

async function downloadToFile(
    url: string,
    headers: Record<string, string>,
    targetFile: string,
    provider: DataProvider,
    progress: ProgressReporter
): Promise<number> {
    const response = await fetch(url, { redirect: 'follow', headers })

    if (response.status === 401 || response.status === 403) {
        const msg = provider === 'Kaggle'
            ? 'Kaggle download requires credentials. Set NUXT_KAGGLE_USERNAME and NUXT_KAGGLE_KEY.'
            : provider === 'HuggingFace'
                ? 'Hugging Face dataset requires authentication. Set NUXT_HF_TOKEN.'
                : `Download failed with status ${response.status}`
        throw new Error(msg)
    }
    if (!response.ok || !response.body) throw new Error(`Failed to download dataset: ${response.status}`)

    const totalBytes = Number(response.headers.get('content-length')) || 0
    if (totalBytes > MAX_DOWNLOAD_BYTES) throw new Error('Dataset exceeds 2GB limit')
    if (progress.getTotalBytes() === 0 && totalBytes > 0) progress.setTotalBytes(totalBytes)

    const nodeStream = Readable.fromWeb(response.body as never)
    nodeStream.on('data', (chunk: Buffer) => progress.trackChunk(chunk.length, nodeStream))

    try {
        await pipeline(nodeStream, fs.createWriteStream(targetFile))
    } catch (error) {
        await fsp.rm(targetFile, { force: true })
        throw error
    }

    return totalBytes
}

async function extractSchemaMetadata(
    schemaCandidates: { type: 'croissant' | 'dcat' | 'zenodo'; urls: string[]; headers: Record<string, string>; payload?: any }[] | undefined
): Promise<ExtractedMetadata | undefined> {
    if (!schemaCandidates?.length) {
        console.log(`[schema-extract] No schemaCandidates provided`);
        return undefined;
    }

    console.log(`[schema-extract] Attempting to extract from ${schemaCandidates.length} candidate(s)`);

    for (const candidate of schemaCandidates) {
        // Handle Zenodo JSON payload extraction
        if (candidate.type === 'zenodo' && candidate.payload) {
            try {
                const extracted = extractFromZenodo(candidate.payload);
                console.log(`[schema-extract] Zenodo JSON extracted:`, JSON.stringify(extracted, null, 2));
                return extracted;
            } catch (err) {
                console.log(`[schema-extract] Failed to extract from Zenodo JSON:`, err instanceof Error ? err.message : String(err));
                continue;
            }
        }

        for (const url of candidate.urls) {
            try {
                const text = await fetchTextWithLimit(url, candidate.headers, MAX_SCHEMA_BYTES);
                console.log(`[schema-extract] Fetched ${candidate.type} from ${url}`);
                if (candidate.type === 'croissant') {
                    const parsed = JSON.parse(text) as unknown;
                    const extracted = extractFromCroissant(parsed);
                    console.log(`[schema-extract] Croissant extracted:`, JSON.stringify(extracted, null, 2));
                    return extracted;
                } else {
                    const extracted = extractFromDcat(text);
                    console.log(`[schema-extract] DCAT extracted:`, JSON.stringify(extracted, null, 2));
                    return extracted;
                }
            } catch (err) {
                console.log(`[schema-extract] Failed to extract from ${url}:`, err instanceof Error ? err.message : String(err));
                continue;
            }
        }
    }
    console.log(`[schema-extract] No schemas extracted from any candidate`);
    return undefined;
}

async function downloadWebpageSnapshot(accessUrl: string, downloadDir: string, identifier: string): Promise<string | undefined> {
    try {
        const response = await fetch(accessUrl, {
            headers: { 'User-Agent': 'dcatextract', Accept: 'text/html' },
            redirect: 'follow'
        })
        if (!response.ok) return undefined
        const html = await response.text()
        const snapshotPath = path.join(downloadDir, `${identifier.replace('/', '-')}-webpage-${Date.now()}.html`)
        await fsp.writeFile(snapshotPath, html, 'utf8')
        return snapshotPath
    } catch {
        return undefined
    }
}

async function extractArchive(archivePath: string, extractDir: string) {
    await fsp.mkdir(extractDir, { recursive: true })
    console.log(`[download-worker] Extracting main archive to: ${extractDir}`)
    try {
        new AdmZip(archivePath).extractAllTo(extractDir, true)
        console.log(`[download-worker] Main archive extracted successfully`)
    } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error(`[download-worker] Failed to extract main archive: ${errMsg}`)
        throw err
    }
    await fsp.rm(archivePath, { force: true })
    
    // Recursively extract any nested zips found in the extracted directory
    console.log(`[download-worker] Checking for nested zips...`)
    await extractNestedZips(extractDir)
}

async function extractNestedZips(dir: string, maxDepth: number = 10, currentDepth: number = 0): Promise<void> {
    if (currentDepth >= maxDepth) {
        console.warn(`[download-worker] Max extraction depth (${maxDepth}) reached at: ${dir}`);
        return;
    }
    
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            await extractNestedZips(fullPath, maxDepth, currentDepth + 1)
        } else if (entry.name.toLowerCase().endsWith('.zip')) {
            try {
                const extractSubDir = path.join(dir, entry.name.replace(/\.zip$/i, ''));
                console.log(`[download-worker] Extracting nested zip: ${entry.name} to ${extractSubDir}`);
                new AdmZip(fullPath).extractAllTo(extractSubDir, true);
                console.log(`[download-worker] Successfully extracted ${entry.name}, removing zip...`);
                await fsp.rm(fullPath, { force: true });
                console.log(`[download-worker] Removed ${entry.name}`);
                // Recursively check the newly extracted directory for more zips
                await extractNestedZips(extractSubDir, maxDepth, currentDepth + 1)
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                console.error(`[download-worker] Failed to extract nested zip ${entry.name}: ${errMsg}`);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function listFiles(dir: string): string[] {
    const results: string[] = []
    
    function walkDir(dirPath: string) {
        for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
            const fullPath = path.join(dirPath, entry.name)
            if (entry.isDirectory()) {
                walkDir(fullPath)
            } else {
                // Include all files, including zips (file processor can handle extraction)
                results.push(fullPath)
            }
        }
    }
    
    walkDir(dir)
    return results
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    const kb = bytes / 1024
    if (kb < 1024) return `${kb.toFixed(1)} KB`
    const mb = kb / 1024
    if (mb < 1024) return `${mb.toFixed(1)} MB`
    return `${(mb / 1024).toFixed(2)} GB`
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export function startDownloadWorker() {
    const worker = new Worker<DownloadJobDataType, DownloadJobReturnType>(
        'download',
        async (job) => {
            const { sessionId, provider, identifier, sourceUrl } = job.data
            if (!sessionId) throw new Error('Session ID is required for download')

            const config = useRuntimeConfig()
            const { plan, accessUrl, providerBaseUrl, schemaCandidates } = await resolvePlan(provider, identifier, sourceUrl, config)

            const downloadDir = path.join(os.tmpdir(), 'dcat-downloads', sessionId)
            await fsp.mkdir(downloadDir, { recursive: true })

            const progress = new ProgressReporter(job, sessionId)
            await progress.report(1, 'Starting download...')

            const extractDir = path.join(downloadDir, `${identifier.replace('/', '-')}-${Date.now()}`)

            if (plan.kind === 'archive') {
                const archivePath = path.join(downloadDir, `${identifier.replace('/', '-')}-${Date.now()}.zip`)
                const totalBytes = await downloadToFile(plan.url, plan.headers, archivePath, provider, progress)
                if (totalBytes === 0 && progress.getDownloaded() === 0) {
                    await fsp.rm(archivePath, { force: true })
                    throw new Error('Downloaded file is empty')
                }
                await progress.report(95, 'Extracting archive...')
                await extractArchive(archivePath, extractDir)
            } else {
                const totalBytes = plan.files.reduce((sum, f) => sum + (f.size || 0), 0)
                if (totalBytes > MAX_DOWNLOAD_BYTES) throw new Error('Dataset exceeds 2GB limit')
                if (totalBytes > 0) progress.setTotalBytes(totalBytes)
                await fsp.mkdir(extractDir, { recursive: true })
                for (const file of plan.files) {
                    await progress.report(0, `Downloading ${path.basename(file.name)}...`)
                    await downloadToFile(file.url, plan.headers, path.join(extractDir, path.basename(file.name)), provider, progress)
                }
                // Extract any zips that were downloaded
                await progress.report(95, 'Extracting nested zips...')
                await extractNestedZips(extractDir)
            }

            // Diagnostics: Show what was extracted
            console.log(`[download-worker] Listing extracted contents of ${extractDir}:`)
            const allEntries = fs.readdirSync(extractDir, { withFileTypes: true })
            for (const entry of allEntries) {
                const fullPath = path.join(extractDir, entry.name)
                if (entry.isDirectory()) {
                    const fileCount = fs.readdirSync(fullPath, { withFileTypes: true }).length
                    console.log(`  [DIR] ${entry.name}/ (${fileCount} items)`)
                } else {
                    const stats = fs.statSync(fullPath)
                    console.log(`  [FILE] ${entry.name} (${formatBytes(stats.size)})`)
                }
            }

            const extractedFiles = listFiles(extractDir)
            console.log(`[download-worker] Found ${extractedFiles.length} total files to process`)
            if (extractedFiles.length > 0) {
                console.log(`[download-worker] First 5 files:`, extractedFiles.slice(0, 5).map(f => f.replace(extractDir, '').slice(1)))
            }
            
            if (extractedFiles.length === 0) throw new Error('Extracted archive is empty')

            const prefilledMetadata = await extractSchemaMetadata(schemaCandidates)
            console.log(`[download-worker] prefilledMetadata:`, JSON.stringify(prefilledMetadata, null, 2))
            const webpageSnapshot = await downloadWebpageSnapshot(accessUrl, downloadDir, identifier.replace('/', '-'))

            await job.updateData({ ...job.data, accessUrl, downloadUrl: plan.downloadUrl, providerBaseUrl, prefilledMetadata })

            await queuePreviousFilesForStop(sessionId)
            await redis.sadd(`session:${sessionId}:files:unprocessed`, ...extractedFiles)
            await redis.hset(
                `session:${sessionId}:files:original-names`,
                ...extractedFiles.flatMap(f => [f, path.basename(f)])
            )
            await redis.set(`session:${sessionId}:download:status`, 'completed', 'EX', 12 * 3600)
            await redis.del(`session:${sessionId}:download:error`)

            await progress.report(100, 'Download completed')
            notifySession(sessionId, { type: 'download-completed', filePath: extractDir, webpageSnapshot })

            return { filePath: extractDir, byteSize: progress.getDownloaded() }
        },
        {
            connection: redis,
            lockDuration: 5 * 60 * 1000,
            lockRenewTime: 60 * 1000,
            removeOnComplete: { age: 12 * 3600, limit: 50 },
            removeOnFail: { age: 12 * 3600, limit: 50 }
        }
    )

    worker.on('failed', (job: Job | undefined, error: Error) => {
        const sessionId = job?.data?.sessionId
        console.error('[DOWNLOAD] Worker failed:', error.message)
        if (sessionId) {
            notifySession(sessionId, { type: 'download-failed', message: error.message })
            redis.set(`session:${sessionId}:download:status`, 'failed', 'EX', 12 * 3600).catch(() => undefined)
            redis.set(`session:${sessionId}:download:error`, error.message, 'EX', 12 * 3600).catch(() => undefined)
        }
    })

    return worker
}