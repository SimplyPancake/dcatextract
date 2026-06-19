import fs from 'fs/promises'
import { Job, Worker } from 'bullmq'
import { getRedis } from '../utils/redis'

const redis = getRedis()
export function startCleanupWorker() {
  const worker = new Worker(
    'cleanup',
    async (job) => {
      console.log("[CLEAN] Running cleanup!")

      const runtime = useRuntimeConfig()
      if (!runtime.useCleanup) {
        return
      }

      // Find all file and metadata-related keys in Redis
      const fileKeys = await redis.keys('session:*:files:*')
      const metadataKeys = await redis.keys('session:*:metadata:*')
      const keys = [...fileKeys, ...metadataKeys]
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
        const sessionKeys = await redis.keys(`session:${sessionId}:*`)
        
        // Clean up if:
        // 1. No main session marker exists, OR
        // 2. Only has metadata:queued with no actual files to process
        const hasOnlyQueuedMetadata = sessionKeys.length === 1 && sessionKeys[0]?.includes('metadata:queued')
        
        if (!exists || hasOnlyQueuedMetadata) {
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
  const sessionKeys = await redis.keys(`session:${sessionId}:*`)
  
  // Check if session still has any active keys or if the main session marker exists
  const exists = sessionKeys.length > 0 || await redis.exists(`session:${sessionId}`)

  if (exists) {
    console.log(
      '[CLEAN] Session came back online'
    )

    return
  }

  const unprocessedFiles = await redis.smembers(`session:${sessionId}:files:unprocessed`)
  const processedFiles = await redis.smembers(`session:${sessionId}:files:processed`)
  const stoppedFiles = await redis.smembers(`session:${sessionId}:files:stopped`)
  const stoppedMetadata = await redis.smembers(`session:${sessionId}:metadata:stopped`)
  const queuedMetadata = await redis.smembers(`session:${sessionId}:metadata:queued`)

  const allFiles = [...unprocessedFiles, ...processedFiles, ...stoppedFiles, ...stoppedMetadata, ...queuedMetadata]

  for (const file of allFiles) {
    try {
      // Attempt to delete it from disk
      await fs.unlink(file).catch(() => { })

      // Remove from both Redis sets just to be sure
      await redis.srem(`session:${sessionId}:files:unprocessed`, file)
      await redis.srem(`session:${sessionId}:files:processed`, file)
      await redis.srem(`session:${sessionId}:files:stopped`, file)
      await redis.hdel(`session:${sessionId}:files:original-names`, file)
      await redis.srem(`session:${sessionId}:metadata:stopped`, file)
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

  const remainingStopped = await redis.scard(`session:${sessionId}:files:stopped`)
  if (remainingStopped === 0) {
    await redis.del(`session:${sessionId}:files:stopped`)
  }

  const remaningMetadata = await redis.scard(`session:${sessionId}:metadata:stopped`)
  if (remaningMetadata === 0) {
    await redis.del(`session:${sessionId}:metadata:stopped`)
  }

  const remainingQueued = await redis.scard(`session:${sessionId}:metadata:queued`)
  if (remainingQueued === 0) {
    await redis.del(`session:${sessionId}:metadata:queued`)
  }

  // Stop all file jobs with that sessionId
  const sessionJobs = (await fileQueue.getCompleted() as FileProcessJob[])
    .filter(j => j.data?.sessionId == sessionId)

  for (let index = 0; index < sessionJobs.length; index++) {
    sessionJobs[index]?.moveToFailed(new Error("The job was running but the session wasn't up."), sessionJobs[index]?.token!)
    
  }

  console.log(
    '[CLEAN] Cleaned session:',
    sessionId
  )
}