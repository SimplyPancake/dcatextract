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
    metadataFiles: string[] // Paths of the related metadata files for the job
    downloadData?: DownloadJobDataType,
    filePaths: string[],
    originalNames: Record<string, string>
}

export type ProcessedFields = Record<string, ProcessedField>
export type ProcessedField = {
    result: ContextualResult | DeterministicResult,
    strategy: DerivationStrategy
}

export type FileProcessJobReturnType = {
    distributions: ProcessedFields[]
    dataset: ProcessedFields,
    dataService: ProcessedFields,
    catalogRecord: ProcessedFields
}

export type FileProcessJob = Job<FileProcessJobDataType, FileProcessJobReturnType>

export type DownloadJobDataType = {
    sessionId: string
    sourceUrl: string
    provider: DataProvider
    identifier: string
    accessUrl?: string
    downloadUrl?: string
    providerBaseUrl?: string
    downloadedSchemas?: DownloadedSchema[]
}
export type DownloadJobReturnType = {
    filePath: string
    byteSize: number
    downloadedSchemas?: DownloadedSchema[]
    webpageSnapshot?: string
}

export type DownloadJob = Job<DownloadJobDataType, DownloadJobReturnType>

export type DownloadedSchema = {
    format: 'dcat' | 'croissant'
    originalUrl: string
    localPath: string
    convertedToDcat?: boolean
}

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
    derivationFunction: (input: TInput) => TReturn
}

export type DerivationMap = Record<string, ContextualKeyProcessInformation | DeterministicKeyProcessInformation<any, any>>

export type ScoredValue<T> = {
    value: T | null;
    confidence: number;
};

export type ContextualResults = Record<string, ContextualResult>
export type DeterministicResults = Record<string, DeterministicResult>;
export type ContextualResult = ScoredValue<string>
export type DeterministicResult = ScoredValue<any>
