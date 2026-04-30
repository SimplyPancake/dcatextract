import { startCleanupWorker } from "../workers/cleanup-worker"
import { startFileWorker } from "../workers/file-worker"

export default defineNitroPlugin(() => {
    startFileWorker()
    startCleanupWorker()

    console.log('Workers started')
//   if (process.env.NITRO_PRESET === 'server') {
//   }
})