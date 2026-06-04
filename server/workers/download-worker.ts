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

const redis = getRedis()
const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024
const PROGRESS_UNK_BYTES_STEP = 5 * 1024 * 1024

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ZenodoFile = {
    name: string
    url: string
    size: number
}

type DownloadPlan =
    | { kind: 'archive'; url: string; headers: Record<string, string>; downloadUrl: string }
    | { kind: 'files'; files: ZenodoFile[]; headers: Record<string, string>; downloadUrl: string }

type ResolvedPlan = {
    plan: DownloadPlan
    accessUrl: string
    providerBaseUrl?: string
}

interface ProviderStrategy {
    resolve(identifier: string, sourceUrl: string, config: ReturnType<typeof useRuntimeConfig>): Promise<ResolvedPlan>
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

const GitHubProvider: ProviderStrategy = {
    async resolve(identifier, sourceUrl) {
        const response = await fetch(`https://api.github.com/repos/${identifier}`, {
            headers: { 'User-Agent': 'dcatextract' }
        })
        if (!response.ok) {
            throw new Error(`Failed to resolve GitHub repository: ${response.status}`)
        }
        const repo = await response.json() as { default_branch?: string }
        const branch = repo.default_branch || 'main'
        const url = buildProviderDownloadUrl('GitHub', identifier, branch)
        if (!url) throw new Error('Failed to build GitHub download URL')

        return {
            plan: { kind: 'archive', url, headers: { 'User-Agent': 'dcatextract' }, downloadUrl: url },
            accessUrl: buildProviderAccessUrl('GitHub', identifier, sourceUrl) ?? sourceUrl,
            providerBaseUrl: getProviderBaseUrl('GitHub') ?? undefined
        }
    }
}

const HuggingFaceProvider: ProviderStrategy = {
    async resolve(identifier, sourceUrl, config) {
        const baseRoot = getProviderDownloadBaseUrl('HuggingFace')
        if (!baseRoot) throw new Error('Failed to resolve Hugging Face base URL')

        const headers: Record<string, string> = { 'User-Agent': 'dcatextract' }
        if (config.huggingFaceToken) {
            headers.Authorization = `Bearer ${config.huggingFaceToken}`
        }

        for (const branch of ['main', 'master']) {
            const url = buildProviderDownloadUrl('HuggingFace', identifier, branch)
            if (!url) throw new Error('Failed to build Hugging Face download URL')
            const response = await fetch(url, { method: 'HEAD', headers })
            if (response.ok) {
                return {
                    plan: { kind: 'archive', url, headers, downloadUrl: url },
                    accessUrl: buildProviderAccessUrl('HuggingFace', identifier, sourceUrl) ?? sourceUrl,
                    providerBaseUrl: getProviderBaseUrl('HuggingFace') ?? undefined
                }
            }
            if (response.status === 401 || response.status === 403) {
                throw new Error('Hugging Face dataset requires authentication. Set NUXT_HF_TOKEN.')
            }
        }

        throw new Error('Failed to resolve Hugging Face dataset archive')
    }
}

const KaggleProvider: ProviderStrategy = {
    async resolve(identifier, sourceUrl, config) {
        const headers: Record<string, string> = { 'User-Agent': 'dcatextract' }
        const username = config.kaggleUsername as string | undefined
        const key = config.kaggleKey as string | undefined
        if (username && key) {
            headers.Authorization = `Basic ${Buffer.from(`${username}:${key}`).toString('base64')}`
        }

        const url = buildProviderDownloadUrl('Kaggle', identifier)
        if (!url) throw new Error('Failed to build Kaggle download URL')

        return {
            plan: { kind: 'archive', url, headers, downloadUrl: url },
            accessUrl: buildProviderAccessUrl('Kaggle', identifier, sourceUrl) ?? sourceUrl,
            providerBaseUrl: getProviderBaseUrl('Kaggle') ?? undefined
        }
    }
}

const ZenodoProvider: ProviderStrategy = {
    async resolve(identifier, sourceUrl) {
        const headers = { 'User-Agent': 'dcatextract' }

        // Try InvenioRDM files endpoint first (new Zenodo)
        const filesResponse = await fetch(`https://zenodo.org/api/records/${identifier}/files`, { headers })
        if (filesResponse.ok) {
            const payload = await filesResponse.json() as {
                entries?: Array<{ key?: string; links?: { content?: string; self?: string }; size?: number }>
            }
            const files: ZenodoFile[] = (payload.entries ?? [])
                .map(f => ({
                    name: f.key ?? '',
                    url: f.links?.content ?? '',
                    size: f.size ?? 0
                }))
                .filter(f => f.name && f.url)

            if (files.length > 0) {
                return {
                    plan: { kind: 'files', files, headers, downloadUrl: `https://zenodo.org/api/records/${identifier}/files` },
                    accessUrl: buildProviderAccessUrl('Zenodo', identifier, sourceUrl) ?? sourceUrl,
                    providerBaseUrl: getProviderBaseUrl('Zenodo') ?? undefined
                }
            }
        }

        // Fall back to legacy API (old Zenodo)
        const recordResponse = await fetch(`https://zenodo.org/api/records/${identifier}`, { headers })
        if (!recordResponse.ok) {
            throw new Error(`Failed to resolve Zenodo record: ${recordResponse.status}`)
        }
        const payload = await recordResponse.json() as {
            files?: Array<{ key?: string; links?: { download?: string }; size?: number }>
        }
        const files: ZenodoFile[] = (payload.files ?? [])
            .map(f => ({ name: f.key ?? '', url: f.links?.download ?? '', size: f.size ?? 0 }))
            .filter(f => f.name && f.url)

        if (files.length === 0) {
            throw new Error('Zenodo record has no downloadable files')
        }

        return {
            plan: { kind: 'files', files, headers, downloadUrl: `https://zenodo.org/api/records/${identifier}` },
            accessUrl: buildProviderAccessUrl('Zenodo', identifier, sourceUrl) ?? sourceUrl,
            providerBaseUrl: getProviderBaseUrl('Zenodo') ?? undefined
        }
    }
}

const PROVIDERS: Partial<Record<DataProvider, ProviderStrategy>> = {
    GitHub: GitHubProvider,
    HuggingFace: HuggingFaceProvider,
    Kaggle: KaggleProvider,
    Zenodo: ZenodoProvider
}

async function resolveDownloadPlan(
    provider: DataProvider,
    identifier: string,
    sourceUrl: string,
    config: ReturnType<typeof useRuntimeConfig>
): Promise<ResolvedPlan> {
    const strategy = PROVIDERS[provider]
    if (!strategy) throw new Error(`Provider ${provider} not supported for download yet`)
    return strategy.resolve(identifier, sourceUrl, config)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function listFiles(dir: string): string[] {
    const results: string[] = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) results.push(...listFiles(fullPath))
        else results.push(fullPath)
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

function getDownloadAuthError(provider: DataProvider, status: number): string | null {
    if (status !== 401 && status !== 403) return null
    if (provider === 'Kaggle') return 'Kaggle download requires credentials. Set NUXT_KAGGLE_USERNAME and NUXT_KAGGLE_KEY.'
    if (provider === 'HuggingFace') return 'Hugging Face dataset requires authentication. Set NUXT_HF_TOKEN.'
    return null
}

async function ensureDownloadDir(sessionId: string): Promise<string> {
    const dir = path.join(os.tmpdir(), 'dcat-downloads', sessionId)
    await fsp.mkdir(dir, { recursive: true })
    return dir
}

function buildArchivePath(downloadDir: string, identifier: string): string {
    return path.join(downloadDir, `${identifier.replace('/', '-')}-${Date.now()}.zip`)
}

function buildExtractDir(downloadDir: string, identifier: string): string {
    return path.join(downloadDir, `${identifier.replace('/', '-')}-${Date.now()}`)
}

// ---------------------------------------------------------------------------
// Progress reporter
// ---------------------------------------------------------------------------

function createProgressReporter(
    job: Job<DownloadJobDataType, DownloadJobReturnType>,
    sessionId: string
) {
    let downloaded = 0
    let lastReported = -1
    let totalBytes = 0

    const report = async (progress: number, message: string) => {
        await job.updateProgress({ progress, message } as WorkerProgress)
        notifySession(sessionId, { type: 'download-progress', progress, message, downloadedBytes: downloaded, totalBytes })
    }

    const setTotalBytes = (bytes: number) => { totalBytes = bytes }
    const getTotalBytes = () => totalBytes
    const getDownloaded = () => downloaded

    const trackChunk = (chunkSize: number, stream: Readable) => {
        downloaded += chunkSize
        if (downloaded > MAX_DOWNLOAD_BYTES) {
            stream.destroy(new Error('Dataset exceeds 2GB limit'))
            return
        }
        if (totalBytes > 0) {
            const pct = Math.min(99, Math.floor((downloaded / totalBytes) * 100))
            if (pct !== lastReported) {
                lastReported = pct
                report(pct, `Downloading dataset... (${formatBytes(downloaded)} / ${formatBytes(totalBytes)})`).catch(() => undefined)
            }
        } else if (downloaded - lastReported > PROGRESS_UNK_BYTES_STEP) {
            lastReported = downloaded
            report(0, `Downloading dataset... (${formatBytes(downloaded)})`).catch(() => undefined)
        }
    }

    return { report, setTotalBytes, getTotalBytes, trackChunk, getDownloaded }
}

// ---------------------------------------------------------------------------
// Download / extract
// ---------------------------------------------------------------------------

async function downloadToFile(
    url: string,
    headers: Record<string, string>,
    targetFile: string,
    provider: DataProvider,
    progress: ReturnType<typeof createProgressReporter>
): Promise<number> {
    const response = await fetch(url, { redirect: 'follow', headers })
    const authError = getDownloadAuthError(provider, response.status)
    if (authError) throw new Error(authError)
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

async function extractArchive(targetFile: string, extractDir: string) {
    await fsp.mkdir(extractDir, { recursive: true })
    new AdmZip(targetFile).extractAllTo(extractDir, true)
    await fsp.rm(targetFile, { force: true })
}

async function downloadZenodoFiles(
    files: ZenodoFile[],
    headers: Record<string, string>,
    provider: DataProvider,
    extractDir: string,
    progress: ReturnType<typeof createProgressReporter>
) {
    await fsp.mkdir(extractDir, { recursive: true })
    for (const file of files) {
        const fileName = path.basename(file.name)
        await progress.report(0, `Downloading ${fileName}...`)
        await downloadToFile(file.url, headers, path.join(extractDir, fileName), provider, progress)
    }
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
            const { plan, accessUrl, providerBaseUrl } = await resolveDownloadPlan(provider, identifier, sourceUrl, config)

            await job.updateData({ ...job.data, accessUrl, downloadUrl: plan.downloadUrl, providerBaseUrl })

            const downloadDir = await ensureDownloadDir(sessionId)
            const progress = createProgressReporter(job, sessionId)
            await progress.report(1, 'Starting download...')

            const extractDir = buildExtractDir(downloadDir, identifier)

            if (plan.kind === 'archive') {
                const targetFile = buildArchivePath(downloadDir, identifier)
                const totalBytes = await downloadToFile(plan.url, plan.headers, targetFile, provider, progress)
                if (totalBytes === 0 && progress.getDownloaded() === 0) {
                    await fsp.rm(targetFile, { force: true })
                    throw new Error('Downloaded file is empty')
                }
                await progress.report(95, 'Extracting archive...')
                await extractArchive(targetFile, extractDir)
            } else {
                const totalBytes = plan.files.reduce((sum, f) => sum + (f.size || 0), 0)
                if (totalBytes > 0) {
                    if (totalBytes > MAX_DOWNLOAD_BYTES) throw new Error('Dataset exceeds 2GB limit')
                    progress.setTotalBytes(totalBytes)
                }
                await downloadZenodoFiles(plan.files, plan.headers, provider, extractDir, progress)
            }

            const extractedFiles = listFiles(extractDir)
            if (extractedFiles.length === 0) throw new Error('Extracted archive is empty')

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
        console.log('[DOWNLOAD] Worker failed: ', error.message)
        if (sessionId) {
            notifySession(sessionId, { type: 'download-failed', message: error.message })
            redis.set(`session:${sessionId}:download:status`, 'failed', 'EX', 12 * 3600).catch(() => undefined)
            redis.set(`session:${sessionId}:download:error`, error.message, 'EX', 12 * 3600).catch(() => undefined)
        }
    })

    return worker
}