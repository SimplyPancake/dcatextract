import type { FileProcessJob } from "./workers"

export type LatestJobDTO = {
	lastJob: FileProcessJob,
	originalNames: Record<string, string>,
} | undefined