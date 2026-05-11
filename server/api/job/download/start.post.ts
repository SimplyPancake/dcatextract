import { z } from 'zod'
import { downloadQueue } from '~~/server/utils/bull'
import { getRedis } from '~~/server/utils/redis'
import type { DownloadJobDataType } from '~~/shared/types/workers'
import type { DataProvider } from '~~/shared/types/url'

const providerSchema = z.enum(['Kaggle', 'HuggingFace', 'CKAN', 'GitHub', 'Unknown'] as const)

const bodySchema = z.object({
  url: z.url(),
  provider: providerSchema.refine(value => value !== 'Unknown', { message: 'Unknown provider' }) as z.ZodType<DataProvider>,
  identifier: z.string().min(1)
})

export default defineEventHandler(async (event) => {
  const sessionId = event.context.sessionId
  if (!sessionId) {
    throw createError('Session ID is required to proceed.')
  }

  const result = await readValidatedBody(event, body => bodySchema.safeParse(body))
  if (!result.success) {
    throw result.error.issues
  }

  const { url, provider, identifier } = result.data

  const activeJobs = await downloadQueue.getJobs(['active', 'waiting', 'delayed'])
  const runningJob = activeJobs.find(job => job.data?.sessionId === sessionId)
  if (runningJob) {
    return { jobId: runningJob.id }
  }

  const redis = getRedis()
  const jobData: DownloadJobDataType = {
    sessionId,
    sourceUrl: url,
    provider,
    identifier
  }

  const jobId = `download:${sessionId}:${Date.now()}`
  const job = await downloadQueue.add('download-dataset', jobData, { jobId })

  await redis.set(`session:${sessionId}:download:jobId`, job.id!, 'EX', 12 * 3600)
  await redis.set(`session:${sessionId}:download:status`, 'running', 'EX', 12 * 3600)

  setResponseStatus(event, 200)
  return { jobId: job.id }
})
