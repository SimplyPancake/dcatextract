import * as fs from "node:fs";
import * as path from "node:path";
import AdmZip from "adm-zip";
import { Distribution, InferOptions } from "../../../shared/types/dcat3.js";
import { extractFileText, walk } from "./helpers.js";
import { inferDistributionMetadata, type DistributionDeterministicInput } from "./distribution-inference.js";
import {
    inferDatasetTitle,
    inferDatasetLicense,
    inferDatasetRights,
    inferDatasetTemporal,
    inferDatasetSpatial,
    inferDatasetIdentifier,
    inferDatasetIssued,
    inferDatasetModified,
    inferDatasetLanguage,
    inferDatasetConformsTo,
    inferDatasetAccessRights,
    type DistributionResultsFlat,
} from "./dataset-inference.js";
import { CustomProperty, CustomPropertyContext } from "~~/shared/types/schema.js";
import { DerivationMap, ContextualResults, DeterministicResults, ProcessedFields, ProcessedField, DerivationStrategy } from "~~/shared/types/workers.js";
import { z } from "zod";
import { processCompactProperties, processProperties } from "./ai-derive.js";
import {
    collectAllContextualDerivations,
    collectContextualDerivations,
    collectDeterministicDerivations,
    collectDeterministicResults,
    fetchRemoteText,
    groupCustomProperties,
    mergeScoredResults,
    sourceUrlFromInfo,
    type ContextualDerivation,
    type SourceInfo,
} from "./derivation-helpers.js";

/**
 * Puts inputs in a temp folder to extract and work with them
 * @param filePaths The files to analyse
 * @param tmpDir The temporary directory to put the files into
 * @param log Log function with a message parameter
 */
function stageInputs(
    filePaths: string[],
    tmpDir: string,
    log: (msg: string) => void,
    originalNames?: Record<string, string>
): void {
    for (const [index, filePath] of filePaths.entries()) {
        const baseName = path.basename(originalNames?.[filePath] ?? filePath);
        const targetDir = filePaths.length === 1 ? tmpDir : path.join(tmpDir, `file-${index}`);
        fs.mkdirSync(targetDir, { recursive: true });

        // If file is a zip, extract it; otherwise copy it
        if (baseName.toLowerCase().endsWith('.zip')) {
            try {
                const zip = new AdmZip(filePath);
                log(`Extracting zip: ${baseName}`);
                zip.extractAllTo(targetDir, true);
            } catch (err) {
                log(`Failed to extract zip ${baseName}, copying as regular file: ${err instanceof Error ? err.message : String(err)}`);
                const targetPath = path.join(targetDir, baseName);
                fs.copyFileSync(filePath, targetPath);
            }
        } else {
            const targetPath = path.join(targetDir, baseName);
            fs.copyFileSync(filePath, targetPath);
        }
    }
}

// Map of properties we know how to derive.
const DISTRIBUTION_MAP: DerivationMap = {
    description: {
        strategy: "Contextual",
        contextMessage: "Short description of what the file content is about. Infer from content",
    },
    license: {
        strategy: "Contextual",
        contextMessage: "License terms for using the distribution.",
    },
    rights: {
        strategy: "Contextual",
        contextMessage: "Rights or usage constraints beyond the license.",
    },
    language: {
        strategy: "Contextual",
        contextMessage: "Primary language of the distribution content. Answer in two-letter language code",
    },
    conformsTo: {
        strategy: "Contextual",
        contextMessage: "Standard or specification the distribution conforms to.",
    },
    temporal: {
        strategy: "Contextual",
        contextMessage: "Time period covered by the distribution.",
    },
    temporalResolution: {
        strategy: "Contextual",
        contextMessage: "Temporal resolution such as daily, monthly, or yearly.",
    },
    spatial: {
        strategy: "Contextual",
        contextMessage: "Spatial coverage for the distribution.",
    },
    spatialResolutionInMeters: {
        strategy: "Contextual",
        contextMessage: "Spatial resolution in meters.",
    },
    uri: {
        strategy: "Deterministic",
        returnType: z.string(),
        derivationFunction: (input: DistributionDeterministicInput) => inferDistributionMetadata(input).uri,
    },
    accessURL: {
        strategy: "Deterministic",
        returnType: z.string(),
        derivationFunction: (input: DistributionDeterministicInput) => inferDistributionMetadata(input).accessURL,
    },
    downloadURL: {
        strategy: "Deterministic",
        returnType: z.string().nullable(),
        derivationFunction: (input: DistributionDeterministicInput) => inferDistributionMetadata(input).downloadURL,
    },
    title: {
        strategy: "Deterministic",
        returnType: z.string(),
        derivationFunction: (input: DistributionDeterministicInput) => inferDistributionMetadata(input).title,
    },
    mediaType: {
        strategy: "Deterministic",
        returnType: z.string(),
        derivationFunction: (input: DistributionDeterministicInput) => inferDistributionMetadata(input).mediaType,
    },
    format: {
        strategy: "Deterministic",
        returnType: z.string().nullable(),
        derivationFunction: (input: DistributionDeterministicInput) => inferDistributionMetadata(input).format,
    },
    packageFormat: {
        strategy: "Deterministic",
        returnType: z.string().nullable(),
        derivationFunction: (input: DistributionDeterministicInput) => inferDistributionMetadata(input).packageFormat,
    },
    compressFormat: {
        strategy: "Deterministic",
        returnType: z.string().nullable(),
        derivationFunction: (input: DistributionDeterministicInput) => inferDistributionMetadata(input).compressFormat,
    },
    byteSize: {
        strategy: "Deterministic",
        returnType: z.number(),
        derivationFunction: (input: DistributionDeterministicInput) => inferDistributionMetadata(input).byteSize,
    },
    modified: {
        strategy: "Deterministic",
        returnType: z.string(),
        derivationFunction: (input: DistributionDeterministicInput) => inferDistributionMetadata(input).modified,
    },
    issued: {
        strategy: "Deterministic",
        returnType: z.string().nullable(),
        derivationFunction: (input: DistributionDeterministicInput) => inferDistributionMetadata(input).issued,
    },
};

const DATASET_MAP: DerivationMap = {
    title: {
        strategy: "Contextual",
        contextMessage: "Short title describing what the dataset is about."
    },
    description: {
        strategy: "Contextual",
        contextMessage: "Short general description of the dataset's content, coverage, and purpose.",
    },
    identifier: {
        strategy: "Deterministic",
        returnType: z.string().nullable(),
        derivationFunction: (input: DistributionResultsFlat[]) => inferDatasetIdentifier(input),
    },
    issued: {
        strategy: "Deterministic",
        returnType: z.string().nullable(),
        derivationFunction: (input: DistributionResultsFlat[]) => inferDatasetIssued(input),
    },
    modified: {
        strategy: "Deterministic",
        returnType: z.string().nullable(),
        derivationFunction: (input: DistributionResultsFlat[]) => inferDatasetModified(input),
    },
    language: {
        strategy: "Deterministic",
        returnType: z.array(z.string()).nullable(),
        derivationFunction: (input: DistributionResultsFlat[]) => inferDatasetLanguage(input),
    },
    conformsTo: {
        strategy: "Deterministic",
        returnType: z.array(z.string()).nullable(),
        derivationFunction: (input: DistributionResultsFlat[]) => inferDatasetConformsTo(input),
    },
    accessRights: {
        strategy: "Deterministic",
        returnType: z.string().nullable(),
        derivationFunction: (input: DistributionResultsFlat[]) => inferDatasetAccessRights(input),
    },
    keyword: {
        strategy: "Contextual",
        contextMessage: "Keywords that describe the dataset's content and topics.",
    },
    theme: {
        strategy: "Contextual",
        contextMessage: "Themes or categories for the dataset (e.g., Environment, Health, Economics).",
    },
    publisher: {
        strategy: "Contextual",
        contextMessage: "Organization responsible for publishing the dataset.",
    },
    creator: {
        strategy: "Contextual",
        contextMessage: "Primary creator or author of the dataset.",
    },
    type: {
        strategy: "Contextual",
        contextMessage: "Type or classification of the dataset (e.g., numerical, categorical, geographic).",
    },
    license: {
        strategy: "Deterministic",
        returnType: z.string().nullable(),
        derivationFunction: (input: DistributionResultsFlat[]) => inferDatasetLicense(input),
    },
    rights: {
        strategy: "Deterministic",
        returnType: z.string().nullable(),
        derivationFunction: (input: DistributionResultsFlat[]) => inferDatasetRights(input),
    },
    contactPoint: {
        strategy: "Contextual",
        contextMessage: "Contact information for questions about the dataset.",
    },
    landingPage: {
        strategy: "Contextual",
        contextMessage: "Landing page URL with more details about the dataset.",
    },
    temporal: {
        strategy: "Deterministic",
        returnType: z.object({
            startDate: z.string().optional(),
            endDate: z.string().optional(),
        }).nullable(),
        derivationFunction: (input: DistributionResultsFlat[]) => inferDatasetTemporal(input),
    },
    spatial: {
        strategy: "Deterministic",
        returnType: z.object({
            bbox: z.string().optional(),
            centroid: z.string().optional(),
        }).nullable(),
        derivationFunction: (input: DistributionResultsFlat[]) => inferDatasetSpatial(input),
    },
    accrualPeriodicity: {
        strategy: "Contextual",
        contextMessage: "Frequency at which the dataset is updated (e.g., monthly, yearly, never).",
    },
};

const DATA_SERVICE_MAP: DerivationMap = {
    title: {
        strategy: "Contextual",
        contextMessage: "Name of the data service.",
    },
    description: {
        strategy: "Contextual",
        contextMessage: "Short description of the data service.",
    },
    endpointURL: {
        strategy: "Contextual",
        contextMessage: "Primary API endpoint URL for the service.",
    },
    endpointDescription: {
        strategy: "Contextual",
        contextMessage: "Documentation or description URL for the service endpoint.",
    },
    servesDataset: {
        strategy: "Contextual",
        contextMessage: "Datasets served by this service.",
    },
};

type CatalogRecordDeterministicInput = {
    distributions: DistributionResultsFlat[];
    sourceInfo?: SourceInfo;
};

function inferCatalogRecordSource(input: CatalogRecordDeterministicInput): string | null {
    const sourceUrl = sourceUrlFromInfo(input.sourceInfo);
    if (sourceUrl) return sourceUrl;

    const first = input.distributions[0];
    const accessUrl = first?.["distribution.accessURL"]?.value;
    if (typeof accessUrl === "string") return accessUrl;

    const downloadUrl = first?.["distribution.downloadURL"]?.value;
    if (typeof downloadUrl === "string") return downloadUrl;

    return null;
}

function inferCatalogRecordUri(input: CatalogRecordDeterministicInput): string | null {
    const sourceUrl = inferCatalogRecordSource(input);
    if (sourceUrl) return `${sourceUrl}#record`;

    const first = input.distributions[0];
    const distUri = first?.["distribution.uri"]?.value;
    if (typeof distUri === "string") return `${distUri}#record`;

    return null;
}

const CATALOG_RECORD_MAP: DerivationMap = {
    title: {
        strategy: "Contextual",
        contextMessage: "Title of the catalog record.",
    },
    description: {
        strategy: "Contextual",
        contextMessage: "Short description of the catalog record.",
    },
    issued: {
        strategy: "Deterministic",
        returnType: z.string().nullable(),
        derivationFunction: (input: CatalogRecordDeterministicInput) => inferDatasetIssued(input.distributions),
    },
    modified: {
        strategy: "Deterministic",
        returnType: z.string().nullable(),
        derivationFunction: (input: CatalogRecordDeterministicInput) => inferDatasetModified(input.distributions),
    },
    language: {
        strategy: "Deterministic",
        returnType: z.array(z.string()).nullable(),
        derivationFunction: (input: CatalogRecordDeterministicInput) => inferDatasetLanguage(input.distributions),
    },
    conformsTo: {
        strategy: "Deterministic",
        returnType: z.array(z.string()).nullable(),
        derivationFunction: (input: CatalogRecordDeterministicInput) => inferDatasetConformsTo(input.distributions),
    },
    uri: {
        strategy: "Deterministic",
        returnType: z.string().nullable(),
        derivationFunction: (input: CatalogRecordDeterministicInput) => inferCatalogRecordUri(input),
    },
    source: {
        strategy: "Deterministic",
        returnType: z.string().nullable(),
        derivationFunction: (input: CatalogRecordDeterministicInput) => inferCatalogRecordSource(input),
    },
    status: {
        strategy: "Contextual",
        contextMessage: "Status of the catalog record.",
    },
};

const CONTEXT_MAPS: Record<CustomPropertyContext, DerivationMap> = {
    dataset: DATASET_MAP,
    distribution: DISTRIBUTION_MAP,
    dataService: DATA_SERVICE_MAP,
    catalogRecord: CATALOG_RECORD_MAP,
};

type DerivationPlan = {
    contextual_derivations: ContextualDerivation[];
    deterministic_derivations: Array<{ key: string; info: DeterministicKeyProcessInformation<any, any> }>;
    additional_derivations: string[];
};

// Now that we have the plan of deriving, we will do the deriving!
type ContextualResultsTypeInfoType = {
    contextual_derivations: ContextualResults,
    deterministic_derivations: DeterministicResults,
    additional_derivations: ContextualResults,
}

type ContextualResultsCollectionType = {
    distribution: ContextualResultsTypeInfoType[],
    dataset: ContextualResultsTypeInfoType,
    dataService: ContextualResultsTypeInfoType,
    catalogRecord: ContextualResultsTypeInfoType
}

function compileResults(info: ContextualResultsTypeInfoType): ProcessedFields {
    const output: ProcessedFields = {}

    const compileProcessedFields = (results: ContextualResults, strategy: DerivationStrategy) => {
        for(const key in results) {
            const ScoredValue = results[key]!
            const processedField = {
                result: ScoredValue,
                strategy
            } as ProcessedField
    
            output[key] = processedField
        }
    }

    compileProcessedFields(info.contextual_derivations, 'Contextual')
    compileProcessedFields(info.additional_derivations, 'Contextual')
    compileProcessedFields(info.deterministic_derivations, 'Deterministic')

    return output
}

// Track inherited fields: for each key in list, if metadata[key] exists, add prefix.key to set
function trackInheritedFields(
    metadata: Record<string, any> | undefined,
    prefix: string,
    keys: string[],
    set: Set<string>
) {
    if (!metadata) return;
    for (const k of keys) {
        if (metadata[k]) set.add(`${prefix}.${k}`);
    }
}

// Get keys from metadata that have truthy values
function getExistingKeys(metadata: Record<string, any> | undefined, keys: string[]): Set<string> {
    const existing = new Set<string>();
    if (!metadata) return existing;
    for (const k of keys) {
        if (metadata[k]) existing.add(k);
    }
    return existing;
}

// Apply prefilled metadata values to contextual derivations with 100% confidence, only if field is empty
function applyPrefillToContextual(
    metadata: Record<string, any> | undefined,
    prefix: string,
    keys: string[],
    contextualDerivations: Record<string, any>
) {
    if (!metadata) return;
    for (const k of keys) {
        const fieldKey = `${prefix}.${k}`;
        if (metadata[k] && metadata[k] != '' && !contextualDerivations[fieldKey]) {
            contextualDerivations[fieldKey] = { value: metadata[k], confidence: 1.0 };
        }
    }
}

export async function inferDcatFromFiles(
    absFilePath: string[],
    opts: InferOptions = {},
    tmpDir: string,
    logProgress: (message: string) => Promise<void>,
    selectedProperties: Record<string, boolean>,
    sourceInfo?: { accessUrl?: string; downloadUrl?: string; prefilledMetadata?: any; useInheritedMetadata?: boolean },
    originalNames?: Record<string, string>,
    customProperties: CustomProperty[] = [],
    metadata: string = ""
) {
    const verbose = opts.verbose ?? false;
    const log = (msg: string) => { if (verbose) process.stderr.write(msg + "\n"); };

    if (absFilePath.length === 0) {
        throw new Error("No files provided for inference");
    }

    await logProgress("Staging inputs")
    stageInputs(absFilePath, tmpDir, log, originalNames);
    await logProgress("Inputs staged")

    const allFiles = walk(tmpDir);
    log(`Found ${allFiles.length} total files`);
    await logProgress(`Staged file count: ${allFiles.length}`)

    const customPropsByContext = groupCustomProperties(customProperties);
    await logProgress("Grouped custom properties")

    const derivationPlan: Record<CustomPropertyContext, DerivationPlan> = {
        dataset: {
            contextual_derivations: [],
            deterministic_derivations: [],
            additional_derivations: [],
        },
        distribution: {
            contextual_derivations: [],
            deterministic_derivations: [],
            additional_derivations: [],
        },
        dataService: {
            contextual_derivations: [],
            deterministic_derivations: [],
            additional_derivations: [],
        },
        catalogRecord: {
            contextual_derivations: [],
            deterministic_derivations: [],
            additional_derivations: [],
        },
    };

    await logProgress("Building derivation plan")
    for (const context of Object.keys(CONTEXT_MAPS) as CustomPropertyContext[]) {
        const map = CONTEXT_MAPS[context];
        derivationPlan[context] = {
            contextual_derivations: collectContextualDerivations(selectedProperties, context, map),
            deterministic_derivations: collectDeterministicDerivations(selectedProperties, context, map),
            additional_derivations: customPropsByContext[context] ?? [],
        };
    }
    await logProgress("Derivation plan ready")

    const contextualResultsCollection: ContextualResultsCollectionType = {
        distribution: [],
        dataset: {
            contextual_derivations: {},
            deterministic_derivations: {},
            additional_derivations: {}
        },
        dataService: {
            contextual_derivations: {},
            deterministic_derivations: {},
            additional_derivations: {}
        },
        catalogRecord: {
            contextual_derivations: {},
            deterministic_derivations: {},
            additional_derivations: {}
        },
    };

    // Track which fields were inherited from prefilled metadata across all contexts
    const inheritedDatasetFields = new Set<string>();
    const inheritedDistributionFields: Set<string>[] = [];
    const inheritedCatalogRecordFields = new Set<string>();
    const inheritedDataServiceFields = new Set<string>();

    await logProgress("Starting inference")
    await logProgress(`Processing ${absFilePath.length} distributions`)

    // Distribution contextual results
    // TODO: For contents of CSV's only return the columns and the first few rows.
    for (let distIndex = 0; distIndex < absFilePath.length; distIndex++) {
        const filePath = absFilePath[distIndex]!;
        if (!derivationPlan.distribution) {
            continue
        }
        const displayName = originalNames?.[filePath] ?? path.basename(filePath);
        await logProgress(`Processing ${displayName}`)

        const results: ContextualResultsTypeInfoType = {
            contextual_derivations: {},
            deterministic_derivations: {},
            additional_derivations: {}
        }

        await logProgress(`Reading ${displayName}`)
        const fileContents = await extractFileText(filePath, 1500)
        await logProgress(`Extracted text from ${displayName}`)
        const plan = derivationPlan.distribution
        const deterministicInput: DistributionDeterministicInput = {
            filePath,
            sourceInfo,
            originalName: originalNames?.[filePath],
        }

        if (plan.deterministic_derivations) {
            await logProgress(`Deriving deterministic distribution metadata for ${displayName}`)
            results.deterministic_derivations = collectDeterministicResults(
                selectedProperties,
                "distribution",
                DISTRIBUTION_MAP,
                deterministicInput
            );
            await logProgress(`Derived deterministic distribution metadata for ${displayName}`)
        }

        // Apply prefilled distribution metadata BEFORE LLM (if available for this distribution index)
        const prefillDist = sourceInfo?.prefilledMetadata?.distributions?.[distIndex];
        const distributionInheritedFields = new Set<string>();
        if (prefillDist && sourceInfo?.useInheritedMetadata !== false) {
            const distKeys = ['title', 'description', 'format', 'mediaType', 'license', 'accessURL', 'downloadURL', 'byteSize'];
            applyPrefillToContextual(prefillDist, 'distribution', distKeys, results.contextual_derivations);
            trackInheritedFields(prefillDist, 'distribution', distKeys, distributionInheritedFields);
            inheritedDistributionFields[distIndex] = distributionInheritedFields;
        } else {
            inheritedDistributionFields[distIndex] = new Set<string>();
        }

        if (plan.contextual_derivations.length > 0) {
            // Get contextual derivation - skip fields that are already inherited with 100% confidence
            await logProgress(`Deriving contextual distribution metadata for ${displayName}`)
            const filteredPlanDerivations = plan.contextual_derivations.filter(d => !distributionInheritedFields.has(d.key));
            
            if (filteredPlanDerivations.length > 0) {
                const llmResults = await processProperties(
                    "distribution",
                    filteredPlanDerivations,
                    fileContents,
                    "You are inferring properties regarding a DCAT distribution.",
                    path.basename(filePath),
                    metadata
                );
                // Merge LLM results but don't overwrite inherited values (confidence 1.0)
                for (const [key, value] of Object.entries(llmResults)) {
                    if (!results.contextual_derivations[key] || results.contextual_derivations[key]!.confidence < 1.0) {
                        results.contextual_derivations[key] = value;
                    }
                }
            }
            await logProgress(`Derived contextual distribution metadata for ${displayName}`)
        }

        if (plan.additional_derivations.length > 0) {
            // Then obtain extra properties
            await logProgress(`Deriving custom distribution metadata for ${displayName}`)
            results.additional_derivations = await processProperties(
                "distribution",
                plan.additional_derivations.map(x => ({
                    key: x
                })),
                fileContents,
                "You are inferring properties regarding a DCAT distribution. These properties have a custom DCAT IRI that describe them. Use the IRI local name as the main semantic clue and return a nonzero confidence when the file provides any useful signal.",
                path.basename(filePath),
                metadata
            )
            await logProgress(`Derived custom distribution metadata for ${displayName}`)
        }

        // Push to large object
        contextualResultsCollection.distribution.push(results)
        await logProgress(`Distribution metadata saved for ${displayName}`)
    }

    // Dataset derivation
    // Dataset properties are derived by the info about all the files.
    await logProgress("Processing dataset")
    const flatKeysDistribution = contextualResultsCollection
        .distribution
        .map(distribution => {
            return {
                ...distribution.deterministic_derivations,
                ...distribution.contextual_derivations,
                ...distribution.additional_derivations
            }
        })
    if (derivationPlan.dataset) {

        // Collect deterministic derivations from distribution data
        await logProgress("Deriving deterministic dataset metadata")
        contextualResultsCollection.dataset.deterministic_derivations =
            collectDeterministicResults(selectedProperties, "dataset", DATASET_MAP, flatKeysDistribution);
        await logProgress("Derived deterministic dataset metadata")

        // Apply prefilled metadata to dataset (only if useInheritedMetadata is enabled)
        if (sourceInfo?.useInheritedMetadata !== false && sourceInfo?.prefilledMetadata) {
            const datasetKeys = ['title', 'description', 'identifier', 'version', 'keywords', 'theme', 'subject', 'creator', 'publisher', 'contactPoint', 'license', 'rights', 'accessRights', 'issued', 'modified', 'inLanguage', 'conformsTo', 'spatial', 'temporal', 'accrualPeriodicity', 'landingPage', 'documentation', 'type'];
            applyPrefillToContextual(sourceInfo.prefilledMetadata, 'dataset', datasetKeys, contextualResultsCollection.dataset.contextual_derivations);
            trackInheritedFields(sourceInfo.prefilledMetadata, 'dataset', datasetKeys, inheritedDatasetFields);
        }

        // Collect contextual derivations from file contents (skip fields already in prefilledMetadata)
        if (derivationPlan.dataset.contextual_derivations.length > 0) {
            const distributionContents = JSON.stringify(flatKeysDistribution)

            // Filter out any contextual derivations that are already inherited (prefixed keys match inheritedDatasetFields)
            const filteredContextualDerivations = derivationPlan.dataset.contextual_derivations.filter(
                d => !inheritedDatasetFields.has(d.key)
            );

            if (filteredContextualDerivations.length > 0) {
                await logProgress("Deriving contextual dataset metadata")
                const llmResults = await processProperties(
                    "dataset",
                    filteredContextualDerivations,
                    distributionContents,
                    `You are inferring properties regarding a DCAT dataset. Use the aggregated file contents descriptions to derive dataset-level metadata in DCAT. 
                    Consider all files as a single collection. 
                    If properties are not specifically stated, give a plausible value for the property with lower confidence (0.2 - 0.4)`,
                    "dataset",
                    metadata
                );
                // Merge LLM results but don't overwrite inherited values (confidence 1.0)
                for (const [key, value] of Object.entries(llmResults)) {
                    if (!contextualResultsCollection.dataset.contextual_derivations[key] || contextualResultsCollection.dataset.contextual_derivations[key]!.confidence < 1.0) {
                        contextualResultsCollection.dataset.contextual_derivations[key] = value;
                    }
                }
                await logProgress("Derived contextual dataset metadata")
            } else {
                await logProgress("All dataset contextual fields already provided")
            }
        }

        // Collect additional custom properties for dataset
        if (derivationPlan.dataset.additional_derivations.length > 0) {
            await logProgress("Deriving custom dataset metadata")
            const allFileContents = (await Promise.all(
                absFilePath.map(filePath => extractFileText(filePath, 3000))
            )).join("\n\n");

            contextualResultsCollection.dataset.additional_derivations = await processProperties(
                "dataset",
                derivationPlan.dataset.additional_derivations.map(x => ({
                    key: x
                })),
                allFileContents,
                "You are inferring properties regarding a DCAT dataset. These properties have a custom DCAT IRI for the dataset. Use the IRI local name as the main semantic clue and return a nonzero confidence when the files provide any useful signal.",
                "dataset",
                metadata
            );
            await logProgress("Derived custom dataset metadata")
        }
    }

    // Data provider
    if (derivationPlan.dataService) {
        await logProgress("Processing data provider")
        const providerUrl = sourceUrlFromInfo(sourceInfo);
        
        // Apply prefilled dataService metadata FIRST (inherited from provider schemas)
        if (sourceInfo?.useInheritedMetadata !== false && sourceInfo?.prefilledMetadata) {
            const serviceKeys = ['title', 'description'];
            applyPrefillToContextual(sourceInfo.prefilledMetadata, 'dataService', serviceKeys, contextualResultsCollection.dataService.contextual_derivations);
            trackInheritedFields(sourceInfo.prefilledMetadata, 'dataService', serviceKeys, inheritedDataServiceFields);
        }

        await logProgress("Derived deterministic data provider metadata")
        contextualResultsCollection.dataService.deterministic_derivations = {
            ...(providerUrl ? {
                "dataService.endpointURL": {
                    value: providerUrl,
                    confidence: 1,
                },
            } : {}),
        };
        await logProgress("Derived deterministic data provider metadata")

        await logProgress("Fetching data provider context")
        const providerContent = providerUrl
            ? await fetchRemoteText(providerUrl, 2000) ?? JSON.stringify(flatKeysDistribution)
            : JSON.stringify(flatKeysDistribution);
        await logProgress("Fetched data provider context")

        // Filter out inherited fields from LLM derivation
        const providerContextualDerivations = derivationPlan.dataService.contextual_derivations.length > 0
            ? derivationPlan.dataService.contextual_derivations.filter(d => !inheritedDataServiceFields.has(d.key))
            : [];

        if (providerContextualDerivations.length > 0) {
            await logProgress("Deriving contextual data provider metadata")
            const llmResults = await processProperties(
                "dataService",
                providerContextualDerivations,
                providerContent,
                providerUrl
                    ? "You are inferring properties regarding a DCAT data service. This content was fetched from the data provider URL. Use it to infer the provider title, description, endpoint description, and related metadata."
                    : "You are inferring properties regarding a DCAT data service. No provider URL was available. Infer contextual information about the data provider from the dataset files, filenames, and embedded references.",
                providerUrl ? path.basename(new URL(providerUrl).pathname || providerUrl) : "dataService",
                metadata
            );
            // Merge LLM results but don't overwrite inherited values (confidence 1.0)
            for (const [key, value] of Object.entries(llmResults)) {
                if (!contextualResultsCollection.dataService.contextual_derivations[key] || contextualResultsCollection.dataService.contextual_derivations[key]!.confidence < 1.0) {
                    contextualResultsCollection.dataService.contextual_derivations[key] = value;
                }
            }
            await logProgress("Derived contextual data provider metadata")
        } else {
            await logProgress("All data provider contextual fields already provided")
        }

        await logProgress("Deriving custom data provider metadata")
        contextualResultsCollection.dataService.additional_derivations = await processProperties(
            "dataService",
            derivationPlan.dataService.additional_derivations.map(x => ({
                key: x
            })),
            providerContent,
            "You are inferring properties regarding a DCAT data service. These properties have a custom DCAT IRI for the dataset. Use the IRI local name as the main semantic clue and return a nonzero confidence when the files provide any useful signal.",
            metadata
        )
        await logProgress("Derived custom data provider metadata")
    }

    // Catalog
    if (derivationPlan.catalogRecord) {
        await logProgress("Processing catalog record")

        const contextualDerivs = derivationPlan.catalogRecord.contextual_derivations.length > 0
            ? derivationPlan.catalogRecord.contextual_derivations
            : collectAllContextualDerivations(CATALOG_RECORD_MAP);

        // Apply prefilled catalog record metadata (if useInheritedMetadata is enabled)
        if (sourceInfo?.useInheritedMetadata !== false && sourceInfo?.prefilledMetadata) {
            const pm = sourceInfo.prefilledMetadata;
            // Note: Catalog record metadata can be derived from dataset/dataService, but we don't have explicit catalog fields in prefilledMetadata
            // Catalog metadata like title, description, issued, modified can be inferred from dataset if needed
        }

        contextualResultsCollection.catalogRecord.contextual_derivations = await processProperties(
            "catalogRecord",
            contextualDerivs,
            JSON.stringify(contextualResultsCollection.dataset) + JSON.stringify(contextualResultsCollection.dataService),
            "You are inferring properties regarding a DCAT catalog record. Given is information about the dataset and dataservice.",
            metadata
        )
        await logProgress("Catalog record processing complete")
    }

    // Helper function to compile results and mark inherited fields
    function compileResultsWithInherited(info: ContextualResultsTypeInfoType, inheritedFields?: Set<string>): ProcessedFields {
        const output: ProcessedFields = {}

        const compileProcessedFields = (results: ContextualResults, strategy: DerivationStrategy) => {
            for(const key in results) {
                const ScoredValue = results[key]!
                const finalStrategy = inheritedFields?.has(key) ? 'Inherited' : strategy
                const processedField = {
                    result: ScoredValue,
                    strategy: finalStrategy
                } as ProcessedField
        
                output[key] = processedField
            }
        }

        compileProcessedFields(info.contextual_derivations, 'Contextual')
        compileProcessedFields(info.additional_derivations, 'Contextual')
        compileProcessedFields(info.deterministic_derivations, 'Deterministic')

        return output
    }

    // Note: catalogRecord and dataService fields are typically derived, not directly inherited from provider metadata

    const results: FileProcessJobReturnType = {
        catalogRecord: compileResultsWithInherited(contextualResultsCollection.catalogRecord, inheritedCatalogRecordFields),
        dataService: compileResultsWithInherited(contextualResultsCollection.dataService, inheritedDataServiceFields),
        dataset: compileResultsWithInherited(contextualResultsCollection.dataset, inheritedDatasetFields),
        distributions: contextualResultsCollection.distribution.map((x, i) => {
            const compiled = compileResultsWithInherited(x, inheritedDistributionFields[i]) as ProcessedFields & { _distributionFilepath?: string }
            compiled._distributionFilepath = absFilePath[i] ?? ''
            return compiled
        })
    }

    return results
}
