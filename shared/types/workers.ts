import type { Job } from "bullmq"
import type { Distribution } from "./dcat3"
import type { DataProvider } from "./url"

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

export type DownloadJobDataType = {
    sessionId: string
    sourceUrl: string
    provider: DataProvider
    identifier: string
}

export type DownloadJobReturnType = {
    filePath: string
    byteSize: number
}

export type KaggleInformation = {
    croissant: Record<string, any>
    identifier: string
    description: string
    files: string[]
}