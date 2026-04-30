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

      const files = await redis.smembers(
        `session:${sessionId}:files`
      )

      for (const file of files) {
        try {
          await fs.unlink(file)
        }
        catch (e) {
          console.error(e)
        }
      }

      await redis.del(
        `session:${sessionId}:files`
      )

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