import { Job } from 'bullmq'
import { downloadQueue } from '~~/server/utils/bull'
import { getRedis } from '~~/server/utils/redis'

export default defineEventHandler(async (event) => {
  const sessionId = event.context.sessionId
  if (!sessionId) {
    throw createError('Session ID is required to proceed.')
  }

  const activeJobs = await downloadQueue.getJobs(['active', 'waiting', 'delayed'])
  const job = activeJobs.find(job => job.data?.sessionId === sessionId) as Job | undefined

  const redis = getRedis()
  let status = await redis.get(`session:${sessionId}:download:status`)
  const errorMessage = await redis.get(`session:${sessionId}:download:error`)
  const unprocessedCount = await redis.scard(`session:${sessionId}:files:unprocessed`)

  if (!job && status && unprocessedCount === 0) {
    await redis.del(
      `session:${sessionId}:download:status`,
      `session:${sessionId}:download:jobId`,
      `session:${sessionId}:download:error`
    )
    status = null
  }

  return { job, status, errorMessage }
})
