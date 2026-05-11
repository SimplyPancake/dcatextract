import { fileQueue } from '~~/server/utils/bull';
import { LatestJobDTO} from "~~/shared/types/dto"
export default defineEventHandler(async (event) => {
  const sessionId = event.context.sessionId;
  if (!sessionId) {
    throw createError("Session ID is required to proceed.")
  }

  // Check BullMQ for running jobs for this session
  const lastJob: LatestJobDTO = (await fileQueue.getCompleted())
    .filter(j => j.data?.sessionId == sessionId && j.isFailed)
    .sort((a, b) => b.finishedOn! - a.finishedOn! )[0]
  
  if (!lastJob) {
    throw createError('Could not find last job!')
  }

  lastJob.retry()
  return lastJob
});
