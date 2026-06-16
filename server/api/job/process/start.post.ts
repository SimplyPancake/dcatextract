import z from 'zod';
import { downloadQueue, fileQueue, flowProducer } from '~~/server/utils/bull';
import { DownloadJob, DownloadSourceType, FileProcessJobDataType } from '~~/shared/types/workers';
import { getRedis } from '~~/server/utils/redis';
import { CustomPropertySchema } from '~~/shared/types/schema';

const dictSchema = z.object({
	schemas: z.record(z.string(), z.boolean()),
	customProperties: z.array(CustomPropertySchema),
	inferencePercentage: z.number().min(0).max(100),
	stopMetadata: z.boolean().default(false),
	useInheritedMetadata: z.boolean().default(true)
})

export default defineEventHandler(async (event) => {
	const sessionId = event.context.sessionId
	const result = await readValidatedBody(event, body => dictSchema.safeParse(body))

	if (!result.success) {
		throw result.error.issues
	}

	const { schemas, customProperties, inferencePercentage, stopMetadata, useInheritedMetadata } = result.data

	if (!sessionId) {
		throw createError("Session ID is required to proceed.")
	}

	const queueData: Partial<FileProcessJobDataType> = {
		sessionId,
		selectedMetadata: schemas,
		customProperties,
		inferencePercentage,
		downloadType: DownloadSourceType.LOCALFILE,
		metadataFiles: [],
		useInheritedMetadata,
		stopMetadata
	}

	// Check if there is already a job working
	const runningJob = (await fileQueue.getActive()).some(x => (x.data as FileProcessJobDataType).sessionId == sessionId)
	if (runningJob) {
		const failError = new Error("Another job wants to run")

		const job = (await fileQueue.getActive()).filter(x => (x.data as FileProcessJobDataType).sessionId == sessionId)[0]!
		job.moveToFailed(failError, job.token!)
	}


	const redis = getRedis()
	queueData.metadataFiles = await redis.smembers(`session:${sessionId}:metadata:queued`)
	queueData.filePaths = await redis.smembers(`session:${sessionId}:files:unprocessed`)
	queueData.originalNames = await redis.hgetall(`session:${sessionId}:files:original-names`)
	const downloadJobId = await redis.get(`session:${sessionId}:download:jobId`)

	if (downloadJobId) {
		queueData.downloadType = DownloadSourceType.DOWNLOADSOURCE
		const downloadJob = await downloadQueue.getJob(downloadJobId)
		if (downloadJob) {
			if (await downloadJob.isFailed()) {
				throw createError('Download job failed. Please retry the download.')
			}

			// Job is finished and has data!
			queueData.downloadData = (downloadJob as DownloadJob).data
			const prefilledMetadata = (downloadJob as DownloadJob).data.prefilledMetadata
			if (prefilledMetadata) {
				queueData.prefilledMetadata = prefilledMetadata
			}
			
			// Add webpage snapshot to metadata files if available
			const jobResult = (downloadJob as DownloadJob).returnvalue as { filePath: string; byteSize: number; webpageSnapshot?: string } | undefined
			if (jobResult?.webpageSnapshot) {
				queueData.metadataFiles.push(jobResult.webpageSnapshot)
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