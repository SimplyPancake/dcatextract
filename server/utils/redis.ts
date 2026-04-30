import IORedis, { Redis } from 'ioredis'

let redis: Redis | undefined

export function getRedis(): Redis {
	if (!redis) {
		// @ts-ignore - useRuntimeConfig is available in Nitro context
		const config = useRuntimeConfig()
		redis = new IORedis(config.redisUrl, {
            maxRetriesPerRequest: null
        })
		redis.on('error', (err) => {
			console.error('Redis error:', err)
		})
	}
	return redis
}
