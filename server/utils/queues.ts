import { Queue } from 'bullmq'
import { getRedis } from './redis'

const redis = getRedis()

export const fileQueue = new Queue(
  'file-processing',
  {
    connection: redis
  }
)

export const cleanupQueue = new Queue(
  'cleanup',
  {
    connection: redis
  }
)