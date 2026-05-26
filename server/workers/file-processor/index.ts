import * as fs from "node:fs";
import * as path from "node:path";
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
import { DerivationMap, ContextualResults } from "~~/shared/types/workers.js";
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
    type DeterministicResults,
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
        const targetPath = path.join(targetDir, baseName);
        fs.copyFileSync(filePath, targetPath);
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
export async function inferDcatFromFiles(
    absFilePath: string[],
    opts: InferOptions = {},
    tmpDir: string,
    logProgress: (message: string) => Promise<void>,
    selectedProperties: Record<string, boolean>,
    sourceInfo?: { accessUrl?: string; downloadUrl?: string },
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

    await logProgress("Scanning staged files")
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

    await logProgress("Starting inference")
    await logProgress(`Processing ${absFilePath.length} distributions`)

    // Distribution contextual results
    // TODO: For contents of CSV's only return the columns and the first few rows.
    for (let filePath of absFilePath) {        
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

        if (plan.contextual_derivations.length > 0) {
            // Get contextual derivation
            await logProgress(`Deriving contextual distribution metadata for ${displayName}`)
            results.contextual_derivations = await processProperties(
                "distribution",
                plan.contextual_derivations,
                fileContents,
                "You are inferring properties regarding a DCAT distribution.",
                path.basename(filePath),
                metadata
            );
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
        
        // Collect contextual derivations from file contents
        if (derivationPlan.dataset.contextual_derivations.length > 0) {
            const distributionContents = JSON.stringify(flatKeysDistribution)
            
            await logProgress("Deriving contextual dataset metadata")
            contextualResultsCollection.dataset.contextual_derivations = await processProperties(
                "dataset",
                derivationPlan.dataset.contextual_derivations,
                distributionContents,
                `You are inferring properties regarding a DCAT dataset. Use the aggregated file contents descriptions to derive dataset-level metadata in DCAT. 
                Consider all files as a single collection. 
                If properties are not specifically stated, give a plausible value for the property with lower confidence (0.2 - 0.4)`,
                "dataset",
                metadata
            );
            await logProgress("Derived contextual dataset metadata")
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
        const providerContextualDerivations = derivationPlan.dataService.contextual_derivations.length > 0
            ? derivationPlan.dataService.contextual_derivations
            : collectAllContextualDerivations(DATA_SERVICE_MAP);

        await logProgress("Deriving deterministic data provider metadata")
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

        await logProgress("Deriving contextual data provider metadata")
        contextualResultsCollection.dataService.contextual_derivations = await processProperties(
            "dataService",
            providerContextualDerivations,
            providerContent,
            providerUrl
                ? "You are inferring properties regarding a DCAT data service. This content was fetched from the data provider URL. Use it to infer the provider title, description, endpoint description, and related metadata."
                : "You are inferring properties regarding a DCAT data service. No provider URL was available. Infer contextual information about the data provider from the dataset files, filenames, and embedded references.",
            providerUrl ? path.basename(new URL(providerUrl).pathname || providerUrl) : "dataService",
            metadata
        );
        await logProgress("Derived contextual data provider metadata")
        
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

        contextualResultsCollection.catalogRecord.contextual_derivations = await processProperties(
            "catalogRecord",
            contextualDerivs,
            JSON.stringify(contextualResultsCollection.dataset) + JSON.stringify(contextualResultsCollection.dataService),
            "You are inferring properties regarding a DCAT catalog record. Given is information about the dataset and dataservice.",
            metadata
        )
        await logProgress("Catalog record processing complete")
    }

    return contextualResultsCollection
}
