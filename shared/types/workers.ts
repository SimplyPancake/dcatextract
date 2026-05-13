import type { Job } from "bullmq"
import type { Dataset, Distribution } from "./dcat3"
import type { DataProvider } from "./url"

interface Dictionary<T> {
  [Key: string]: T
}

export enum DownloadSourceType {
    LOCALFILE,
    DOWNLOADSOURCE
}

export type WorkerProgress = {
    progress: number,
    message: string
}

export type FileProcessJobDataType = {
    sessionId: string
    selectedMetadata: Dictionary<boolean>
    downloadType: DownloadSourceType
    downloadData?: DownloadJobDataType
}

export type FileProcessJobReturnType = Dataset

export type FileProcessJob = Job<FileProcessJobDataType, FileProcessJobReturnType>

export type DownloadJobDataType = {
    sessionId: string
    sourceUrl: string
    provider: DataProvider
    identifier: string
    accessUrl?: string
    downloadUrl?: string
    providerBaseUrl?: string
}

export type DownloadJobReturnType = {
    filePath: string
    byteSize: number
}

export type DownloadJob = Job<DownloadJobDataType, DownloadJobReturnType>

export type KaggleInformation = {
    croissant: Record<string, any>
    identifier: string
    description: string
    files: string[]
}