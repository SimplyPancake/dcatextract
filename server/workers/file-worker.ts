import { Worker, QueueEvents } from 'bullmq'
import { getRedis } from '../utils/redis'
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { inferDcatFromFiles } from './file-processor'
import { notifySession } from '../utils/wsManager'
import { WorkerProgress } from "~~/shared/types/workers"

const redis = getRedis()
export function startFileWorker() {

    // TODO: Base Worker class
    const worker = new Worker(
        'file-processing',

        async (job) => {
            const { sessionId } = job.data

            if (!sessionId) {
                console.log("[FILE_PROC] No sessionID. Exiting")
                return
            }

            async function updateProgress(prc: number, message: string) {
                await job.updateProgress({
                    progress: prc,
                    message: message
                } as WorkerProgress)
                notifySession(sessionId, { type: 'progress', progress: prc, message })
            }
            
            const filepaths = await redis.smembers(`session:${sessionId}:files:unprocessed`)

            let paths: string[] = Array.isArray(filepaths) ? filepaths : []
            if (paths.length === 0) {
                throw new Error('No files found for processing')
            }
            console.log('Processing:', { filepaths, sessionId })

            // Move files from unprocessed to processing
            await redis.sadd(`session:${sessionId}:files:processing`, ...paths)
            await redis.srem(`session:${sessionId}:files:unprocessed`, ...paths)

            await updateProgress(5, 'Preparing temporary directory...')

            // Process all files (zips are extracted) to infer DCAT metadata
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dcat-infer-"));
            await job.updateData({ ...job.data, tmpDir });

            await updateProgress(10, 'Inferring DCAT metadata...')
            let prevProgress = 10
            let nextProgress = 95
            function updateProgressInfer(prc: number, message: string) {
                let between = nextProgress - prevProgress
                let result = (prc / 100) * between
                let updateNum = Math.round(prevProgress + result)
                updateProgress(updateNum, message)
            }

            const catalog = await inferDcatFromFiles(paths, { verbose: true }, tmpDir, updateProgressInfer)

            await updateProgress(95, 'Saving catalog...')

            // Move from processing to processed queue
            if (paths.length > 0) {
                await redis.sadd(`session:${sessionId}:files:processed`, ...paths)
                await redis.srem(`session:${sessionId}:files:processing`, ...paths)
            }
            
            await updateProgress(100, 'Completed')
            
            return catalog
        },
        {
            connection: redis,
            concurrency: 3,
            // Save completed and failed jobs only a short time. Otherwise we might store more data than neccessary
            removeOnComplete: {
                age: 12 * 3600, // 12 hours
                limit: 50 // Remove up to 50 jobs per cleanup iteration
            },
            removeOnFail: {
                age: 12 * 3600,
                limit: 50
            }
        }
    )

    worker.on('completed', (job) => {
        console.log('Completed:', job.id)
        if (job?.data?.sessionId) {
            notifySession(job.data.sessionId, { type: 'completed' })
        }
        if (job?.data?.tmpDir) {
            try {
                fs.rmSync(job.data.tmpDir, { recursive: true, force: true })
            } catch (err) {
                console.error('Failed to remove tmpDir on completion:', err)
            }
        }
    })


    worker.on('failed', async (job, err) => {
        console.error('Failed:', job?.id, err)
        if (job?.data?.sessionId) {
            // Move files back to unprocessed
            const sessionId = job.data.sessionId;
            const processingFiles = await redis.smembers(`session:${sessionId}:files:processing`);
            if (processingFiles.length > 0) {
                await redis.sadd(`session:${sessionId}:files:unprocessed`, ...processingFiles);
                await redis.srem(`session:${sessionId}:files:processing`, ...processingFiles);
            }
            notifySession(sessionId, { type: 'failed', message: err.message });
        }
        if (job?.data?.tmpDir) {
            try {
                fs.rmSync(job.data.tmpDir, { recursive: true, force: true })
            } catch (rmErr) {
                console.error('Failed to remove tmpDir on failure:', rmErr)
            }
        }
    })

    return worker
}