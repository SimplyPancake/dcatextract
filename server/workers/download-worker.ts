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
import type { DownloadJobDataType, DownloadJobReturnType, DownloadedSchema, WorkerProgress } from '~~/shared/types/workers'
import type { DataProvider } from '~~/shared/types/url'
import {
    buildProviderAccessUrl,
    buildProviderDownloadUrl,
    getProviderDownloadBaseUrl,
    getProviderBaseUrl
} from '~~/shared/types/url'
import { queuePreviousFilesForStop } from '../utils/files'
import { convertCroissantToDcatTurtle } from '../utils/croissant'

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

type SchemaPlan = {
    kind: 'croissant' | 'dcat'
    candidates: string[]
    headers: Record<string, string>
}

type ResolvedPlan = {
    plan: DownloadPlan
    accessUrl: string
    providerBaseUrl?: string
    schemaPlans?: SchemaPlan[]
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
                const res = await fetch(url, { method: 'HEAD', headers })
                if (res.status === 401 || res.status === 403) throw new Error('Hugging Face dataset requires authentication. Set NUXT_HF_TOKEN.')
                if (!res.ok) continue
                return {
                    plan: { kind: 'archive', url, headers, downloadUrl: url },
                    accessUrl: buildProviderAccessUrl('HuggingFace', identifier, sourceUrl) ?? sourceUrl,
                    providerBaseUrl: getProviderBaseUrl('HuggingFace') ?? undefined,
                    schemaPlans: [{
                        kind: 'croissant',
                        headers,
                        candidates: [
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
                schemaPlans: [{
                    kind: 'croissant',
                    headers,
                    candidates: [
                        `https://www.kaggle.com/api/v1/datasets/croissant/${identifier}`,
                        `https://www.kaggle.com/api/v1/datasets/metadata/${identifier}`,
                        `https://www.kaggle.com/datasets/${identifier}/croissant.json`,
                        `https://www.kaggle.com/datasets/${identifier}/metadata/croissant.json`
                    ]
                }]
            }
        }

        case 'Zenodo': {
            const headers = { 'User-Agent': 'dcatextract' }
            const dcatSchemaPlans: SchemaPlan[] = [{
                kind: 'dcat',
                headers: { ...headers, Accept: 'text/turtle,application/ld+json,application/rdf+xml;q=0.9,*/*;q=0.8' },
                candidates: [
                    `https://zenodo.org/records/${identifier}/export/dcat`,
                    `https://zenodo.org/records/${identifier}/export/dcat-ap`,
                    `https://zenodo.org/api/records/${identifier}?format=dcat`
                ]
            }]

            // Try InvenioRDM files endpoint first (new Zenodo)
            const filesRes = await fetch(`https://zenodo.org/api/records/${identifier}/files`, { headers })
            if (filesRes.ok) {
                const payload = await filesRes.json() as {
                    entries?: Array<{ key?: string; links?: { content?: string }; size?: number }>
                }
                const files: ZenodoFile[] = (payload.entries ?? [])
                    .map(f => ({ name: f.key ?? '', url: f.links?.content ?? '', size: f.size ?? 0 }))
                    .filter(f => f.name && f.url)
                if (files.length > 0) {
                    return {
                        plan: { kind: 'files', files, headers, downloadUrl: `https://zenodo.org/api/records/${identifier}/files` },
                        accessUrl: buildProviderAccessUrl('Zenodo', identifier, sourceUrl) ?? sourceUrl,
                        providerBaseUrl: getProviderBaseUrl('Zenodo') ?? undefined,
                        schemaPlans: dcatSchemaPlans
                    }
                }
            }

            // Fall back to legacy API
            const payload = await fetchJson<{
                files?: Array<{ key?: string; links?: { download?: string }; size?: number }>
            }>(`https://zenodo.org/api/records/${identifier}`, headers)

            const files: ZenodoFile[] = (payload.files ?? [])
                .map(f => ({ name: f.key ?? '', url: f.links?.download ?? '', size: f.size ?? 0 }))
                .filter(f => f.name && f.url)
            if (files.length === 0) throw new Error('Zenodo record has no downloadable files')

            return {
                plan: { kind: 'files', files, headers, downloadUrl: `https://zenodo.org/api/records/${identifier}` },
                accessUrl: buildProviderAccessUrl('Zenodo', identifier, sourceUrl) ?? sourceUrl,
                providerBaseUrl: getProviderBaseUrl('Zenodo') ?? undefined,
                schemaPlans: dcatSchemaPlans
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

async function downloadSchemas(
    schemaPlans: SchemaPlan[] | undefined,
    downloadDir: string,
    identifier: string
): Promise<DownloadedSchema[]> {
    if (!schemaPlans?.length) return []
    const results: DownloadedSchema[] = []

    for (const plan of schemaPlans) {
        for (const url of plan.candidates) {
            try {
                const text = await fetchTextWithLimit(url, plan.headers, MAX_SCHEMA_BYTES)
                const schemaPath = path.join(downloadDir, `${identifier.replace('/', '-')}-schema-${Date.now()}.ttl`)

                if (plan.kind === 'croissant') {
                    const turtle = await convertCroissantToDcatTurtle(JSON.parse(text) as unknown)
                    await fsp.writeFile(schemaPath, turtle, 'utf8')
                    results.push({ format: 'dcat', originalUrl: url, localPath: schemaPath, convertedToDcat: true })
                } else {
                    await fsp.writeFile(schemaPath, text, 'utf8')
                    results.push({ format: 'dcat', originalUrl: url, localPath: schemaPath })
                }
                break
            } catch {
                continue
            }
        }
    }

    return results
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
    new AdmZip(archivePath).extractAllTo(extractDir, true)
    await fsp.rm(archivePath, { force: true })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function listFiles(dir: string): string[] {
    const results: string[] = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name)
        entry.isDirectory() ? results.push(...listFiles(fullPath)) : results.push(fullPath)
    }
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
            const { plan, accessUrl, providerBaseUrl, schemaPlans } = await resolvePlan(provider, identifier, sourceUrl, config)

            await job.updateData({ ...job.data, accessUrl, downloadUrl: plan.downloadUrl, providerBaseUrl, downloadedSchemas: [] })

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
            }

            const extractedFiles = listFiles(extractDir)
            if (extractedFiles.length === 0) throw new Error('Extracted archive is empty')

            const [downloadedSchemas, webpageSnapshot] = await Promise.all([
                downloadSchemas(schemaPlans, downloadDir, identifier),
                downloadWebpageSnapshot(accessUrl, downloadDir, identifier)
            ])

            await job.updateData({ ...job.data, accessUrl, downloadUrl: plan.downloadUrl, providerBaseUrl, downloadedSchemas, webpageSnapshot })

            await queuePreviousFilesForStop(sessionId)
            await redis.sadd(`session:${sessionId}:files:unprocessed`, ...extractedFiles)
            await redis.hset(
                `session:${sessionId}:files:original-names`,
                ...extractedFiles.flatMap(f => [f, path.basename(f)])
            )
            await redis.set(`session:${sessionId}:download:status`, 'completed', 'EX', 12 * 3600)
            await redis.del(`session:${sessionId}:download:error`)

            await progress.report(100, 'Download completed')
            notifySession(sessionId, { type: 'download-completed', filePath: extractDir })

            return { filePath: extractDir, byteSize: progress.getDownloaded(), downloadedSchemas, webpageSnapshot }
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