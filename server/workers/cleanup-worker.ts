import fs from 'fs/promises'
import { Job, Worker } from 'bullmq'
import { getRedis } from '../utils/redis'

const redis = getRedis()
export function startCleanupWorker() {
  const worker = new Worker(
    'cleanup',
    async (job) => {
      console.log("[CLEAN] Running cleanup!")
      // Find all file-related keys in Redis
      const keys = await redis.keys('session:*:files:*')
      const sessionIds = new Set<string>()

      for (const key of keys) {
        // Example key: session:123:files:unprocessed
        const parts = key.split(':')
        if (parts.length >= 2) {
          sessionIds.add(parts[1]!) // parts[1] is the sessionId
        }
      }

      // Check if the main session key still exists
      for (const sessionId of sessionIds) {
        const exists = await redis.exists(`session:${sessionId}`)
        if (!exists) {
          await cleanupSession(sessionId)
        }
      }
    },
    {
      connection: redis,
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
  worker.on('failed', (job: Job | undefined, error: Error, prev: string) => {
    console.log('[CLEAN] Worker failed: ', error.message)
  });

  return worker
}


async function cleanupSession(sessionId: string) {
  const exists = await redis.exists(
    `session:${sessionId}`
  )

  if (exists) {
    console.log(
      '[CLEAN] Session came back online'
    )

    return
  }

  const unprocessedFiles = await redis.smembers(`session:${sessionId}:files:unprocessed`)
  const processedFiles = await redis.smembers(`session:${sessionId}:files:processed`)

  const allFiles = [...unprocessedFiles, ...processedFiles]

  for (const file of allFiles) {
    try {
      // Attempt to delete it from disk
      await fs.unlink(file).catch(() => { })

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
    '[CLEAN] Cleaned session:',
    sessionId
  )
}