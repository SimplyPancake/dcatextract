import { FlowProducer, Queue } from 'bullmq'
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

export const downloadQueue = new Queue(
  'download',
  {
    connection: redis,
  }
)

export const flowProducer = new FlowProducer({
  connection: redis
})