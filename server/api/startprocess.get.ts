export default defineEventHandler(async (event) => {
	const redis = getRedis()
	const sessionId = event.context.sessionId

	// TODO: More about session regarding data repositories

	if (!sessionId) {
		throw createError("Session ID is required to proceed.")
	}
    await fileQueue.add('process-session', {
        sessionId,
    })

	setResponseStatus(event, 200)
	return { message: 'Success' }
})