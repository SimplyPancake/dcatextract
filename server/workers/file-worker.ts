import { Worker } from 'bullmq'
import { getRedis } from '../utils/redis'
import { inferDcat, inferDcatFromFiles } from './file-processor'

const redis = getRedis()
export function startFileWorker() {
    const worker = new Worker(
        'file-processing',

        async (job) => {
            const { filepath, filepaths, sessionId } = job.data

            console.log('Processing:', { filepath, filepaths, sessionId })

            let paths: string[] = Array.isArray(filepaths) ? filepaths : []
            if (paths.length === 0 && filepath) paths = [filepath]
            if (paths.length === 0 && sessionId) {
                paths = await redis.smembers(`session:${sessionId}:files`)
            }
            if (paths.length === 0) {
                throw new Error('No files found for processing')
            }

            // Process all files (zips are extracted) to infer DCAT metadata
            const catalog = inferDcatFromFiles(paths, { verbose: true })
            
            // Store the inferred catalog in Redis for the session
            if (sessionId) {
                await redis.set(`catalog:${sessionId}`, JSON.stringify(catalog))
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