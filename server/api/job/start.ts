import { fileQueue } from '~~/server/utils/queues';

export default defineEventHandler(async (event) => {
	const sessionId = event.context.sessionId


	if (!sessionId) {
		throw createError("Session ID is required to proceed.")
	}

    await fileQueue.add('process-session', {
        sessionId,
    })

	setResponseStatus(event, 200)
	return { message: 'Success' }
})