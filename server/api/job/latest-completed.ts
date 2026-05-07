import { fileQueue } from '~~/server/utils/queues';
import { LatestJobDTO} from "~~/shared/types/dto"
export default defineEventHandler(async (event) => {
  const sessionId = event.context.sessionId;
  if (!sessionId) {
    throw createError("Session ID is required to proceed.")
  }

  // Check BullMQ for running jobs for this session
  const lastJob: LatestJobDTO = (await fileQueue.getCompleted())
    .filter(j => j.data?.sessionId == sessionId)
    .sort((a, b) => b.finishedOn! - a.finishedOn! )[0]
  
  console.log(lastJob?.returnvalue)
  return lastJob
});
