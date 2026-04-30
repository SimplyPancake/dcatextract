import type { createClient } from 'redis'

type RedisClient = ReturnType<typeof createClient>

declare module 'nitropack' {
  interface NitroApp {
    redis: RedisClient
  }
}

export {}