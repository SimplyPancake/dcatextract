import type { Job } from "bullmq"
import type { Dataset, Distribution } from "./dcat3"
import type { DataProvider } from "./url"
import type { CustomProperty } from "./schema"
import type { ZodAny, ZodType } from "zod"

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
    customProperties: CustomProperty[]
    inferencePercentage: number
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

export type DerivationStrategy = 'Contextual' | 'Deterministic'

// How to process a given key, for example distribution.title can be inferred from the file
// But any custom property cannot.
export interface KeyProcessInformation {
    strategy: DerivationStrategy
}

export interface ContextualKeyProcessInformation
    extends KeyProcessInformation {
    strategy: 'Contextual'
    contextMessage: string
}

export interface DeterministicKeyProcessInformation<TInput, TReturn>
    extends KeyProcessInformation {
    strategy: 'Deterministic'
    returnType: ZodType
    derivationFunction: (filename: string, input: TInput) => TReturn
}

export type DerivationMap = Record<string, ContextualKeyProcessInformation | DeterministicKeyProcessInformation<any, any>>

export type ScoredValue<T> = {
    value: T | null;
    confidence: number;
};

export type ContextualResults = Record<string, ScoredValue<string>>