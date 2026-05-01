import { Worker } from 'bullmq'
import { getRedis } from '../utils/redis'
import { inferDcat } from './file-processor'

const redis = getRedis()
export function startFileWorker() {
    const worker = new Worker(
        'file-processing',

        async (job) => {
            const { filepath, sessionId } = job.data

            console.log(
                'Processing:',
                filepath,
                sessionId
            )

            // Process the zip file to infer DCAT metadata
            const catalog = inferDcat(filepath, { verbose: true })
            
            // Store the inferred catalog in Redis for the session
            await redis.set(`catalog:${sessionId}`, JSON.stringify(catalog))
            
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