import type { Job } from "bullmq"
import type { Distribution } from "./dcat3"

export type WorkerProgress = {
    progress: number,
    message: string
}

export type FileProcessJobDataType = {
    sessionId: string
}

export type FileProcessJobReturnType = Distribution

export type FileProcessJob = Job<FileProcessJobDataType, FileProcessJobReturnType>