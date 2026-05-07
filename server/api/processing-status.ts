import { getRedis } from '../utils/redis';
import { fileQueue } from '../utils/queues';

export default defineEventHandler(async (event) => {
  const sessionId = event.context.sessionId;
  if (!sessionId) {
    return { processing: false, processingCount: 0, runningJob: false };
  }
  const redis = getRedis();
  const processingCount = await redis.scard(`session:${sessionId}:files:processing`);

  // Check BullMQ for running jobs for this session
  let runningJob = false;
  try {
    const activeJobs = await fileQueue.getActive();
    runningJob = activeJobs.some(job => job.data?.sessionId === sessionId);
  } catch (e) {
    // ignore errors
  }

  return { processing: processingCount > 0, processingCount, runningJob };
});
