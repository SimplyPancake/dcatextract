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
import {
    buildProviderAccessUrl,
    buildProviderDownloadUrl,
    getProviderDownloadBaseUrl,
    getProviderBaseUrl
} from '~~/shared/types/url'
import { queuePreviousFilesForStop } from '../utils/files'

const redis = getRedis()
const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024

function listFiles(dir: string): string[] {
    const results: string[] = []
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            results.push(...listFiles(fullPath))
        } else {
            results.push(fullPath)
        }
    }
    return results
}

async function resolveGitHubDownloadUrl(identifier: string): Promise<string> {
    const apiUrl = `https://api.github.com/repos/${identifier}`
    const response = await fetch(apiUrl, {
        headers: {
            'User-Agent': 'dcatextract'
        }
    })

    if (!response.ok) {
        throw new Error(`Failed to resolve GitHub repository: ${response.status}`)
    }

    const repo = await response.json() as { default_branch?: string }
    const branch = repo.default_branch || 'main'
    const url = buildProviderDownloadUrl('GitHub', identifier, branch)
    if (!url) {
        throw new Error('Failed to build GitHub download URL')
    }
    return url
}

async function resolveHuggingFaceDownloadUrl(identifier: string, token?: string): Promise<string> {
    const baseRoot = getProviderDownloadBaseUrl('HuggingFace')
    if (!baseRoot) {
        throw new Error('Failed to resolve Hugging Face base URL')
    }
    const headers: Record<string, string> = {
        'User-Agent': 'dcatextract'
    }
    if (token) {
        headers.Authorization = `Bearer ${token}`
    }

    for (const branch of ['main', 'master']) {
        const url = buildProviderDownloadUrl('HuggingFace', identifier, branch)
        if (!url) {
            throw new Error('Failed to build Hugging Face download URL')
        }
        const response = await fetch(url, { method: 'HEAD', headers })
        if (response.ok) {
            return url
        }
        if (response.status === 401 || response.status === 403) {
            throw new Error('Hugging Face dataset requires authentication. Set NUXT_HF_TOKEN.')
        }
    }

    throw new Error('Failed to resolve Hugging Face dataset archive')
}

function buildKaggleAuthHeader(username: string, key: string): string {
    return `Basic ${Buffer.from(`${username}:${key}`).toString('base64')}`
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    const kb = bytes / 1024
    if (kb < 1024) return `${kb.toFixed(1)} KB`
    const mb = kb / 1024
    if (mb < 1024) return `${mb.toFixed(1)} MB`
    const gb = mb / 1024
    return `${gb.toFixed(2)} GB`
}

export function startDownloadWorker() {
    const worker = new Worker<DownloadJobDataType, DownloadJobReturnType>(
        'download',
        async (job) => {
            const { sessionId, provider, identifier, sourceUrl } = job.data
            if (!sessionId) {
                throw new Error('Session ID is required for download')
            }

            const config = useRuntimeConfig()
            let downloadUrl = sourceUrl
            const headers: Record<string, string> = {
                'User-Agent': 'dcatextract'
            }

            if (provider === 'GitHub') {
                downloadUrl = await resolveGitHubDownloadUrl(identifier)
            } else if (provider === 'HuggingFace') {
                if (config.huggingFaceToken) {
                    headers.Authorization = `Bearer ${config.huggingFaceToken}`
                }
                downloadUrl = await resolveHuggingFaceDownloadUrl(identifier, config.huggingFaceToken)
            } else if (provider === 'Kaggle') {
                const username = config.kaggleUsername as string | undefined
                const key = config.kaggleKey as string | undefined
                if (username && key) {
                    headers.Authorization = buildKaggleAuthHeader(username, key)
                }
                const url = buildProviderDownloadUrl('Kaggle', identifier)
                if (!url) {
                    throw new Error('Failed to build Kaggle download URL')
                }
                downloadUrl = url
            } else {
                throw new Error(`Provider ${provider} not supported for download yet`)
            }

            const accessUrl = buildProviderAccessUrl(provider, identifier, sourceUrl) ?? sourceUrl
            const providerBaseUrl = getProviderBaseUrl(provider) ?? undefined
            await job.updateData({
                ...job.data,
                accessUrl,
                downloadUrl,
                providerBaseUrl
            })

            const downloadDir = path.join(os.tmpdir(), 'dcat-downloads', sessionId)
            await fsp.mkdir(downloadDir, { recursive: true })
            const targetFile = path.join(
                downloadDir,
                `${identifier.replace('/', '-')}-${Date.now()}.zip`
            )

            const response = await fetch(downloadUrl, { redirect: 'follow', headers })
            if (response.status === 401 || response.status === 403) {
                if (provider === 'Kaggle') {
                    throw new Error('Kaggle download requires credentials. Set NUXT_KAGGLE_USERNAME and NUXT_KAGGLE_KEY.')
                }
                if (provider === 'HuggingFace') {
                    throw new Error('Hugging Face dataset requires authentication. Set NUXT_HF_TOKEN.')
                }
            }
            if (!response.ok || !response.body) {
                throw new Error(`Failed to download dataset: ${response.status}`)
            }

            const totalBytes = Number(response.headers.get('content-length')) || 0
            if (totalBytes > MAX_DOWNLOAD_BYTES) {
                throw new Error('Dataset exceeds 2GB limit')
            }

            let downloaded = 0
            let lastReported = -1

            const updateProgress = async (progress: number, message: string) => {
                await job.updateProgress({ progress, message } as WorkerProgress)
                notifySession(sessionId, {
                    type: 'download-progress',
                    progress,
                    message,
                    downloadedBytes: downloaded,
                    totalBytes
                })
            }

            await updateProgress(1, 'Starting download...')

            const nodeStream = Readable.fromWeb(response.body as never)
            nodeStream.on('data', (chunk: Buffer) => {
                downloaded += chunk.length
                if (downloaded > MAX_DOWNLOAD_BYTES) {
                    nodeStream.destroy(new Error('Dataset exceeds 2GB limit'))
                    return
                }

                if (totalBytes > 0) {
                    const pct = Math.min(99, Math.floor((downloaded / totalBytes) * 100))
                    if (pct !== lastReported) {
                        lastReported = pct
                        updateProgress(pct, `Downloading dataset... (${formatBytes(downloaded)} / ${formatBytes(totalBytes)})`)
                            .catch(() => undefined)
                    }
                } else if (downloaded - lastReported > 5 * 1024 * 1024) {
                    lastReported = downloaded
                    updateProgress(0, `Downloading dataset... (${formatBytes(downloaded)})`)
                        .catch(() => undefined)
                }
            })

            try {
                await pipeline(nodeStream, fs.createWriteStream(targetFile))
            } catch (error) {
                await fsp.rm(targetFile, { force: true })
                throw error
            }

            if (downloaded === 0) {
                await fsp.rm(targetFile, { force: true })
                throw new Error('Downloaded file is empty')
            }

            await updateProgress(95, 'Extracting archive...')

            const extractDir = path.join(
                downloadDir,
                `${identifier.replace('/', '-')}-${Date.now()}`
            )
            await fsp.mkdir(extractDir, { recursive: true })
            const zip = new AdmZip(targetFile)
            zip.extractAllTo(extractDir, true)
            await fsp.rm(targetFile, { force: true })

            const extractedFiles = listFiles(extractDir)
            if (extractedFiles.length === 0) {
                throw new Error('Extracted archive is empty')
            }

            // Remove other processed files
            await queuePreviousFilesForStop(sessionId)

            await redis.sadd(`session:${sessionId}:files:unprocessed`, ...extractedFiles)
            if (extractedFiles.length > 0) {
                const originalNameEntries = extractedFiles
                    .map(filePath => [filePath, path.basename(filePath)] as [string, string])
                await redis.hset(
                    `session:${sessionId}:files:original-names`,
                    ...originalNameEntries.flat()
                )
            }
            await redis.set(`session:${sessionId}:download:status`, 'completed', 'EX', 12 * 3600)
            await redis.del(`session:${sessionId}:download:error`)

            await updateProgress(100, 'Download completed')
            notifySession(sessionId, { type: 'download-completed', filePath: extractDir })

            return {
                filePath: extractDir,
                byteSize: downloaded
            }
        },
        {
            connection: redis,
            removeOnComplete: {
                age: 12 * 3600,
                limit: 50
            },
            removeOnFail: {
                age: 12 * 3600,
                limit: 50
            }
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