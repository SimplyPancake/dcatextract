/**
 * Queues previously uploaded files for cleanup and do not process them.
 */

const redis = getRedis()

export async function queuePreviousFilesForStop(sessionId: string) {
    const previousUnprocessed = await redis.smembers(
        `session:${sessionId}:files:unprocessed`
    )
    if (previousUnprocessed.length > 0) {
        await redis.sadd(
            `session:${sessionId}:files:stopped`,
            ...previousUnprocessed
        )
        await redis.srem(
            `session:${sessionId}:files:unprocessed`,
            ...previousUnprocessed
        )

        await redis.hdel(
            `session:${sessionId}:files:original-names`,
            ...previousUnprocessed
        )
    }
}

export async function queuePreviousMetadataFilesForStop(sessionId: string) {
    const previousMetadata = await redis.smembers(
        `session:${sessionId}:metadata:queued`
    )
    if (previousMetadata.length > 0) {
        await redis.sadd(
            `session:${sessionId}:metadata:stopped`,
            ...previousMetadata
        )
        await redis.srem(
            `session:${sessionId}:metadata:queued`,
            ...previousMetadata
        )
    }
}