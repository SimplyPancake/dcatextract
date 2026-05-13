import * as fs from "node:fs";
import * as path from "node:path";
import { Distribution, InferOptions } from "../../../shared/types/dcat3.js";
import * as builders from "../../../shared/utils/builder";
import { extractFileText, walk } from "./helpers.js";
import { buildDistributionFromFile, createSelectionGuard } from "./distribution-builder.js";
import { processCustomSchemaProperties } from "./ai-derive.js";

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

type dcatReturn = {
    stagedFolder: string
}


export async function inferDcatFromFiles(
    filePaths: string[],
    opts: InferOptions = {},
    tmpDir: string,
    logProgress: (prc: number, message: string) => void,
    selectedProperties: Record<string, boolean>,
    sourceInfo?: { accessUrl?: string; downloadUrl?: string },
    originalNames?: Record<string, string>,
    customProperties: string[] = []
) {
    const verbose = opts.verbose ?? false;
    const log = (msg: string) => { if (verbose) process.stderr.write(msg + "\n"); };
    const selection = createSelectionGuard(selectedProperties);

    if (filePaths.length === 0) {
        throw new Error("No files provided for inference");
    }

    // ── 1. Stage inputs ──────────────────────────────────────────────────────
    stageInputs(filePaths, tmpDir, log, originalNames);

    // ── 2. Enumerate all relative paths ───────────────────────────────────────
    const allFiles = walk(tmpDir);
    log(`Found ${allFiles.length} total files`);

    // Assemble Distribution for each file
    // Then assemble into a dcat:Dataset
    let fileCount = filePaths.length

    const distributions: Distribution[] = []
    const confidence: Record<string, number> = {}
    if (selection.hasSelection("distribution")) {
        logProgress(0, `Scanning file 1/${fileCount}...`)
        for (let fileIdx = 0; fileIdx < fileCount; fileIdx++) {
            const filePath = filePaths[fileIdx]!;

            const { distribution, confidence: distConfidence } = await buildDistributionFromFile(
                filePath,
                selection,
                log,
                sourceInfo,
                originalNames?.[filePath]
            );
            for (const [key, value] of Object.entries(distConfidence)) {
                const shortKey = key.replace(/^distribution\./, "");
                confidence[`distribution[${fileIdx}].${shortKey}`] = value;
            }
            if (fileIdx + 1 != fileCount) {
                logProgress(((fileIdx + 1) / fileCount) * 100, `Scanning file ${fileIdx + 2}/${fileCount}...`)
            }
            distributions.push(distribution);
        }
    }

    const datasetBuilder = new builders.DatasetBuilder()

    distributions.forEach(dis => {
        datasetBuilder.distribution(dis)
    });
    const dataset = datasetBuilder.build()

    const customValues = customProperties.length > 0
        ? await processCustomSchemaProperties(
            await extractFileText(filePaths[0]!, 5000),
            customProperties,
            originalNames?.[filePaths[0]!] ?? path.basename(filePaths[0]!)
        )
        : { values: {}, confidence: {} };

    for (const [key, value] of Object.entries(customValues.confidence)) {
        confidence[key] = value;
    }

    return {
        ...dataset,
        custom: customValues.values,
        confidence,
    }
}
