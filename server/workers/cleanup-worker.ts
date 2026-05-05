import fs from 'fs/promises'
import { Worker } from 'bullmq'
import { getRedis } from '../utils/redis'

const redis = getRedis()
export function startCleanupWorker() {
  const worker = new Worker(
    'cleanup',

    async (job) => {
      const { sessionId } = job.data

      const exists = await redis.exists(
        `session:${sessionId}`
      )

      if (exists) {
        console.log(
          '[CLEANUP]Session came back online'
        )

        return
      }

      const unprocessedFiles = await redis.smembers(`session:${sessionId}:files:unprocessed`)
      const processedFiles = await redis.smembers(`session:${sessionId}:files:processed`)

      const allFiles = [...unprocessedFiles, ...processedFiles]

      for (const file of allFiles) {
        try {
          // Attempt to delete it from disk
          await fs.unlink(file).catch(() => {})
          
          // Remove from both Redis sets just to be sure
          await redis.srem(`session:${sessionId}:files:unprocessed`, file)
          await redis.srem(`session:${sessionId}:files:processed`, file)
        }
        catch (e) {
          console.error(e)
        }
      }

      const remainingUnprocessed = await redis.scard(`session:${sessionId}:files:unprocessed`)
      if (remainingUnprocessed === 0) {
        await redis.del(`session:${sessionId}:files:unprocessed`)
      }

      const remainingProcessed = await redis.scard(`session:${sessionId}:files:processed`)
      if (remainingProcessed === 0) {
        await redis.del(`session:${sessionId}:files:processed`)
      }

      console.log(
        '[CLEANUP]Cleaned session:',
        sessionId
      )
    },

    {
      connection: redis
    }
  )

  return worker
}