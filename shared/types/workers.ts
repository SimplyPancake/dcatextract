import type { Job } from "bullmq"
import type { Distribution } from "./dcat3"

interface Dictionary<T> {
  [Key: string]: T
}

export type WorkerProgress = {
    progress: number,
    message: string
}

export type FileProcessJobDataType = {
    sessionId: string
    selectedMetadata: Dictionary<boolean>
}

export type FileProcessJobReturnType = Distribution

export type FileProcessJob = Job<FileProcessJobDataType, FileProcessJobReturnType>