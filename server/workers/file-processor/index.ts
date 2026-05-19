import * as fs from "node:fs";
import * as path from "node:path";
import { Distribution, InferOptions } from "../../../shared/types/dcat3.js";
import * as builders from "../../../shared/utils/builder";
import { extractFileText, walk } from "./helpers.js";
import { buildDistributionFromFile, createSelectionGuard } from "./distribution-builder.js";
import { CustomProperty, CustomPropertyContext } from "~~/shared/types/schema.js";
import { ContextualKeyProcessInformation, DeterministicKeyProcessInformation, DerivationMap, ScoredValue, ContextualResults } from "~~/shared/types/workers.js";
import { z } from "zod";
import { processProperties } from "./ai-derive.js";

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
        contextMessage: "Short description of the distribution contents and format.",
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
};

const DATASET_MAP: DerivationMap = {
    title: {
        strategy: "Contextual",
        contextMessage: "Name of the dataset.",
    },
    description: {
        strategy: "Contextual",
        contextMessage: "Short description of the dataset.",
    },
    keyword: {
        strategy: "Contextual",
        contextMessage: "Keywords that describe the dataset.",
    },
    theme: {
        strategy: "Contextual",
        contextMessage: "Themes or categories for the dataset.",
    },
    publisher: {
        strategy: "Contextual",
        contextMessage: "Organization responsible for publishing the dataset.",
    },
    creator: {
        strategy: "Contextual",
        contextMessage: "Primary creator or author of the dataset.",
    },
    license: {
        strategy: "Contextual",
        contextMessage: "License terms for the dataset.",
    },
    rights: {
        strategy: "Contextual",
        contextMessage: "Rights or access restrictions for the dataset.",
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
        strategy: "Contextual",
        contextMessage: "Time period covered by the dataset.",
    },
    spatial: {
        strategy: "Contextual",
        contextMessage: "Spatial coverage of the dataset.",
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
        strategy: "Contextual",
        contextMessage: "Date the catalog record was issued.",
    },
    modified: {
        strategy: "Contextual",
        contextMessage: "Date the catalog record was last modified.",
    },
    language: {
        strategy: "Contextual",
        contextMessage: "Language of the catalog record metadata. Answer in two-letter language code",
    },
    source: {
        strategy: "Contextual",
        contextMessage: "Source from which the record metadata was derived.",
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

type ContextualDerivation = {
    key: string;
    info: ContextualKeyProcessInformation;
};

function splitPropertyKey(key: string): { context: CustomPropertyContext; prop: string } | null {
    if (!key.includes('.')) {
        return null
    }
    const idx = key.indexOf(".");
    if (idx <= 0) return null;
    const context = key.slice(0, idx) as CustomPropertyContext;
    const prop = key.slice(idx + 1);
    if (!prop) return null;
    return { context, prop };
}

function collectContextualDerivations(
    selected: Record<string, boolean>,
    context: CustomPropertyContext,
    map: DerivationMap
): ContextualDerivation[] {
    const results: ContextualDerivation[] = [];
    for (const [key, enabled] of Object.entries(selected)) {
        if (!enabled) continue;
        const split = splitPropertyKey(key);
        if (!split || split.context !== context) continue;
        const info = map[split.prop];
        if (info?.strategy === "Contextual") {
            results.push({
                key,
                info,
            });
        }
    }
    return results;
}

function collectDeterministicDerivations(
    selected: Record<string, boolean>,
    context: CustomPropertyContext,
    map: DerivationMap
): Array<{ key: string; info: DeterministicKeyProcessInformation<any, any> }> {
    const results: Array<{ key: string; info: DeterministicKeyProcessInformation<any, any> }> = [];
    for (const [key, enabled] of Object.entries(selected)) {
        if (!enabled) continue;
        const split = splitPropertyKey(key);
        if (!split || split.context !== context) continue;
        const info = map[split.prop];
        if (info?.strategy === "Deterministic") {
            results.push({
                key,
                info,
            });
        }
    }
    return results;
}
function groupCustomProperties(customProperties: CustomProperty[]): Record<CustomPropertyContext, string[]> {
    return customProperties.reduce((acc, prop) => {
        acc[prop.context] = acc[prop.context] ?? [];
        acc[prop.context].push(prop.iri);
        return acc;
    }, {
        dataset: [],
        distribution: [],
        dataService: [],
        catalogRecord: [],
    } as Record<CustomPropertyContext, string[]>);
}

type DerivationPlan = {
    contextual_derivations: ContextualDerivation[];
    deterministic_derivations: Array<{ key: string; info: DeterministicKeyProcessInformation<any, any> }>;
    additional_derivations: string[];
};
export async function inferDcatFromFiles(
    absFilePath: string[],
    opts: InferOptions = {},
    tmpDir: string,
    logProgress: (prc: number, message: string) => void,
    selectedProperties: Record<string, boolean>,
    sourceInfo?: { accessUrl?: string; downloadUrl?: string },
    originalNames?: Record<string, string>,
    customProperties: CustomProperty[] = []
) {
    const verbose = opts.verbose ?? false;
    const log = (msg: string) => { if (verbose) process.stderr.write(msg + "\n"); };

    if (absFilePath.length === 0) {
        throw new Error("No files provided for inference");
    }

    stageInputs(absFilePath, tmpDir, log, originalNames);

    const allFiles = walk(tmpDir);
    log(`Found ${allFiles.length} total files`);

    const customPropsByContext = groupCustomProperties(customProperties);

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

    for (const context of Object.keys(CONTEXT_MAPS) as CustomPropertyContext[]) {
        const map = CONTEXT_MAPS[context];
        derivationPlan[context] = {
            contextual_derivations: collectContextualDerivations(selectedProperties, context, map),
            deterministic_derivations: collectDeterministicDerivations(selectedProperties, context, map),
            additional_derivations: customPropsByContext[context] ?? [],
        };
    }

    // Now that we have the plan of deriving, we will do the deriving!
    type ContextualResultsTypeInfoType = {
        contextual_derivations: ContextualResults,
        deterministic_derivations: ContextualResults,
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

    // Distribution contextual results
    for (let filePath of absFilePath) {
        const results: ContextualResultsTypeInfoType = {
            contextual_derivations: {},
            deterministic_derivations: {},
            additional_derivations: {}
        }

        const fileContents = await extractFileText(filePath, 3000)
        const plan = derivationPlan.distribution

        // Compute/derive computable properties
        //TODO!

        // Get contextual derivation
        results.contextual_derivations = await processProperties(
            "distribution",
            plan.contextual_derivations,
            fileContents,
            undefined,
            path.basename(filePath)
        );

        // Then obtain extra properties
        results.additional_derivations = await processProperties(
            "distribution",
            plan.additional_derivations.map(x => {
                return {
                    key: x
                }
            }),
            fileContents,
            "These properties have a custom DCAT IRI that describe them. Use the IRI local name as the main semantic clue and return a nonzero confidence when the file provides any useful signal.",
            path.basename(filePath)
        )

        // Push to large object
        contextualResultsCollection.distribution.push(results)
    }

    console.log(contextualResultsCollection.distribution)
    return contextualResultsCollection

//     { schemas:                                                                                           14:58:30
//    { 'dataset.versionNotes': true,
//      'dataset.hasCurrentVersion': true,
//      'dataset.hasVersion': true,
//      'dataset.previousVersion': true,
//      'dataset.version': true,
//      'dataset.creator': true,
//      'dataset.description': true,
//      'distribution.description': true,
//      'dataService.description': true,
//      'catalogRecord.description': true,
//      'dataset.license': true,
//      'distribution.license': true,
//      'dataset.modified': true,
//      'distribution.modified': true,
//      'catalogRecord.modified': true,
//      'dataset.publisher': true,
//      'dataset.title': true,
//      'distribution.title': true,
//      'dataService.title': true,
//      'catalogRecord.title': true,
//      'distribution.accessService': true,
//      'distribution.accessURL': true,
//      'distribution.byteSize': true,
//      'dataset.catalog': true,
//      'dataService.catalog': true,
//      'distribution.compressFormat': true,
//      'dataset.contactPoint': true,
//      'dataset.dataset': true,
//      'dataService.dataset': true,
//      'dataset.distribution': true,
//      'dataService.distribution': true,
//      'distribution.downloadURL': true,
//      'dataset.endpointDescription': true,
//      'dataService.endpointDescription': true,
//      'dataset.endpointURL': true,
//      'dataService.endpointURL': true,
//      'dataset.first': true,
//      'dataset.inSeries': true,
//      'dataset.keyword': true,
//      'dataset.landingPage': true,
//      'dataset.last': true,
//      'distribution.mediaType': true,
//      'distribution.packageFormat': true,
//      'dataset.prev': true,
//      'dataset.qualifiedRelation': true,
//      'dataService.qualifiedRelation': true,
//      'dataset.record': true,
//      'dataService.record': true,
//      'dataset.resource': true,
//      'dataService.resource': true,
//      'dataset.servesDataset': true,
//      'dataService.servesDataset': true,
//      'dataset.service': true,
//      'dataService.service': true,
//      'dataset.spatialResolutionInMeters': true,
//      'distribution.spatialResolutionInMeters': true,
//      'dataset.temporalResolution': true,
//      'distribution.temporalResolution': true,
//      'dataset.theme': true,
//      'dataset.themeTaxonomy': true,
//      'dataService.themeTaxonomy': true,
//      'dataset.uri': true,
//      'distribution.uri': true,
//      'catalogRecord.uri': true },
//   customProperties:
//    [ { iri: 'test1', context: 'dataset' },
//      { iri: 'test2', context: 'dataService' },
//      { iri: 'test345345', context: 'catalogRecord' } ],
//   inferencePercentage: 60 }

}
