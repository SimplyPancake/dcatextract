import z from 'zod';
import { downloadQueue, fileQueue, flowProducer } from '~~/server/utils/bull';
import { FileProcessJobDataType } from '~~/shared/types/workers';
import { getRedis } from '~~/server/utils/redis';

const dictSchema = z.object({
	schemas: z.record(z.string(), z.boolean())
})

export default defineEventHandler(async (event) => {
	const sessionId = event.context.sessionId
	const result = await readValidatedBody(event, body => dictSchema.safeParse(body))

	if (!result.success) {
		throw result.error.issues
	}

	const { schemas } = result.data

	if (!sessionId) {
		throw createError("Session ID is required to proceed.")
	}

	const queueData: FileProcessJobDataType = {
		sessionId,
		selectedMetadata: schemas
	}

	// Check if there is already a job working
	const runningJob = (await fileQueue.getActive()).some(x => (x.data as FileProcessJobDataType).sessionId == sessionId)
	if (runningJob) {
		throw createError('A job is already running')
	}


	const redis = getRedis()
	const downloadJobId = await redis.get(`session:${sessionId}:download:jobId`)
	if (downloadJobId) {
		const downloadJob = await downloadQueue.getJob(downloadJobId)
		if (downloadJob) {
			if (await downloadJob.isFailed()) {
				throw createError('Download job failed. Please retry the download.')
			}

			const downloadState = await downloadJob.getState()
			const shouldWaitForDownload = ['waiting', 'active', 'delayed', 'paused'].includes(downloadState)
			if (shouldWaitForDownload) {
				await flowProducer.add({
					name: 'process-session',
					queueName: 'file-processing',
					data: queueData,
					opts: {
						parent: {
							id: downloadJobId,
							queue: 'download'
						}
					}
				})
				return { message: 'Success' }
			}
		}
	}

	await fileQueue.add('process-session', queueData)

	setResponseStatus(event, 200)
	return { message: 'Success' }
})