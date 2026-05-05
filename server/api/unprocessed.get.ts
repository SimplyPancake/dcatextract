export default defineEventHandler(async (event) => {
    const sessionId = event.context.sessionId
    
    if (!sessionId) {
        throw createError({
            statusCode: 401,
            statusMessage: 'No session',
            message: 'Session required'
        })
    }
    
    const redis = getRedis()
    const unprocessedCount = await redis.scard(`session:${sessionId}:files:unprocessed`)
    
    return { unprocessedCount }
})