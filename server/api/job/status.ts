import { Job } from 'bullmq';
import { fileQueue } from '~~/server/utils/queues';

export default defineEventHandler(async (event) => {
  const sessionId = event.context.sessionId;
  if (!sessionId) {
    throw createError("Session ID is required to proceed.")
  }

  // Check BullMQ for running jobs for this session
  const activeJobs = await fileQueue.getActive();
  return activeJobs.find(job => job.data?.sessionId === sessionId) as Job | undefined;
});
