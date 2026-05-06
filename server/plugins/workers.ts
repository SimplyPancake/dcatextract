import { startCleanupWorker } from "../workers/cleanup-worker"
import { startFileWorker } from "../workers/file-worker"

export default defineNitroPlugin(async () => {
    startFileWorker()
    startCleanupWorker()

    // Start jobs/queues which are repeatable
    await cleanupQueue.add(
        'cleanup-session',
        {},
        {
            repeat: {
                pattern: '*/5 * * * *', // https://crontab.guru/#*/5_*_*_*_*
            },
            jobId: 'cleanup-sessions-repeat' // Setting a jobId prevents duplicating the same job on multiple restarts
        }
    )
    console.log('Workers started')
})