import { Worker } from 'bullmq'
import { getRedis } from '../utils/redis'

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

            // process file here
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