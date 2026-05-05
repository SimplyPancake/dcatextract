import { Worker } from 'bullmq'
import { getRedis } from '../utils/redis'
import { inferDcat, inferDcatFromFiles } from './file-processor'

const redis = getRedis()
export function startFileWorker() {
    const worker = new Worker(
        'file-processing',

        async (job) => {
            const { sessionId } = job.data

            if (!sessionId) {
                console.log("[FILE_PROC] No sessionID. Exiting")
                return
            }
            const filepaths = await redis.smembers(`session:${sessionId}:files:unprocessed`)

            
            let paths: string[] = Array.isArray(filepaths) ? filepaths : []
            if (paths.length === 0) {
                throw new Error('No files found for processing')
            }
            console.log('Processing:', { filepaths, sessionId })

            // Process all files (zips are extracted) to infer DCAT metadata
            const catalog = inferDcatFromFiles(paths, { verbose: true })
            
            // Store the inferred catalog in Redis for the session
            if (sessionId) {
                await redis.set(`catalog:${sessionId}`, JSON.stringify(catalog))
                
                // Move from unprocessed to processed queue
                if (paths.length > 0) {
                    await redis.sadd(`session:${sessionId}:files:processed`, ...paths)
                    await redis.srem(`session:${sessionId}:files:unprocessed`, ...paths)
                }
            }
            
            return catalog
        },

        {
            connection: redis,
            concurrency: 3
        }
    )

    worker.on('completed', (job) => {
        console.log('Completed:', job.id)
    })

    worker.on('failed', (job, err) => {
        console.error(
            'Failed:',
            job?.id,
            err
        )
    })

    return worker
}