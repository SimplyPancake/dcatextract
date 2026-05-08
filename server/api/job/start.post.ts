import z from 'zod';
import { fileQueue } from '~~/server/utils/queues';
import { FileProcessJobDataType } from '~~/shared/types/workers';

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


	await fileQueue.add('process-session', queueData)

	setResponseStatus(event, 200)
	return { message: 'Success' }
})