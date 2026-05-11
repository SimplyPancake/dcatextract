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
    return `https://codeload.github.com/${identifier}/zip/refs/heads/${branch}`
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

            let downloadUrl = sourceUrl
            if (provider === 'GitHub') {
                downloadUrl = await resolveGitHubDownloadUrl(identifier)
            } else {
                throw new Error(`Provider ${provider} not supported for download yet`)
            }

            const downloadDir = path.join(os.tmpdir(), 'dcat-downloads', sessionId)
            await fsp.mkdir(downloadDir, { recursive: true })
            const targetFile = path.join(
                downloadDir,
                `${identifier.replace('/', '-')}-${Date.now()}.zip`
            )

            const response = await fetch(downloadUrl, { redirect: 'follow' })
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

            await updateProgress(100, 'Download completed')
            await redis.sadd(`session:${sessionId}:files:unprocessed`, ...extractedFiles)
            await redis.set(`session:${sessionId}:download:status`, 'completed', 'EX', 12 * 3600)

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
        }
    })

    return worker
}