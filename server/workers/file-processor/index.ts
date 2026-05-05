import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Catalog, Dataset, Distribution, InferOptions } from "../../../shared/types/dcat3.js";
import { MEDIA_TYPES, SHAPEFILE_EXTS, SKIP_FILES, DCAT_FORMAT_IRIS } from "./constants.js";
import { inspectFile } from "./inspectors.js";
import { extractKeywords } from "./keywords.js";
import * as builders from "../../../shared/types/utils/builder"
import { readReadme, mdTitle, titleFromStem, mdDescription, walk } from "./helpers.js";
import { getAI } from "~~/server/utils/ai.js";

/**
 * Puts inputs in a temp folder to extract and work with them
 * @param filePaths The files to analyse
 * @param tmpDir The temporary directory to put the files into
 * @param log Log function with a message parameter
 */
function stageInputs(
    filePaths: string[],
    tmpDir: string,
    log: (msg: string) => void
): void {
    for (const [index, filePath] of filePaths.entries()) {
        const baseName = path.basename(filePath);

        const targetDir = filePaths.length === 1 ? tmpDir : path.join(tmpDir, `file-${index}`);
        fs.mkdirSync(targetDir, { recursive: true });
        const targetPath = path.join(targetDir, baseName);
        fs.copyFileSync(filePath, targetPath);
    }
}

function summarizeInputs(filePaths: string[]) {
    const stats = filePaths.map((filePath) => fs.statSync(filePath));
    const totalBytes = stats.reduce((sum, stat) => sum + stat.size, 0);
    const newestModified = stats
        .map((stat) => stat.mtime.toISOString())
        .sort()
        .at(-1);
    return { totalBytes, newestModified };
}

export function inferDcatFromFiles(filePaths: string[], opts: InferOptions = {}) {
    const baseUri = (opts.baseUri ?? "file:///").replace(/\/$/, "/");
    const verbose = opts.verbose ?? false;
    const log = (msg: string) => { if (verbose) process.stderr.write(msg + "\n"); };

    if (filePaths.length === 0) {
        throw new Error("No files provided for inference");
    }

    // ── 1. Stage inputs ──────────────────────────────────────────────────────
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dcat-infer-"));
    stageInputs(filePaths, tmpDir, log);

    // ── 2. Enumerate all relative paths ───────────────────────────────────────
    const allFiles = walk(tmpDir);
    log(`Found ${allFiles.length} total files`);

    // Assemble Distribution for each file
    // Then assemble into a dcat:Dataset
    const distributions: Distribution[] = filePaths.map(rel => {
            const title = titleFromStem(path.basename(rel));
            const ext = path.extname(rel).toLowerCase();
            const stats = fs.statSync(rel);
            const inspectInfo = inspectFile(rel)


            const derivedInfo = {
                ...inspectInfo,
                uri: `${baseUri}${rel}`,
                title: `${title} (${ext.slice(1).toUpperCase()})`,
                accessURL: `${baseUri}${rel}`,
                mediaType: MEDIA_TYPES[ext] ?? "application/octet-stream",
                byteSize: stats.size,
                modified: stats.mtime.toISOString(),
            };

            // Then try to derive by LLM-based context about the file itself?
            return derivedInfo
        });

    const datasetBuilder = new builders.DatasetBuilder()
    
    distributions.forEach(dis => {
        datasetBuilder.distribution(dis)
    });

    console.log(datasetBuilder.build())
    const aiclient = getAI()
    // Then assemble the Dataset and DataSeries

    // // ── 3. Partition: skip meta-only files, separate shapefile companions ──────
    // const skipSet = new Set(allFiles.filter(f => SKIP_FILES.has(path.basename(f).toLowerCase())));
    // const dataFiles = allFiles.filter(f => !skipSet.has(f));

    // // Find shapefile groups (stem → companions)
    // const shapeGroups = new Map<string, string[]>();
    // const nonShapeFiles: string[] = [];

    // for (const f of dataFiles) {
    //     const ext = path.extname(f).toLowerCase();
    //     const stem = f.slice(0, f.length - ext.length);
    //     if (SHAPEFILE_EXTS.has(ext)) {
    //         if (!shapeGroups.has(stem)) shapeGroups.set(stem, []);
    //         shapeGroups.get(stem)!.push(f);
    //     } else {
    //         nonShapeFiles.push(f);
    //     }
    // }

    // // ── 4. Group remaining files by their parent directory ────────────────────
    // const dirGroups = new Map<string, string[]>();
    // for (const f of nonShapeFiles) {
    //     const dir = path.dirname(f);  // "." for root files
    //     if (!dirGroups.has(dir)) dirGroups.set(dir, []);
    //     dirGroups.get(dir)!.push(f);
    // }

    // // ── 5. Catalog-level README ───────────────────────────────────────────────
    // const rootReadme = readReadme(tmpDir);
    // const primaryStem = filePaths.length === 1
    //     ? path.basename(filePaths[0]!, path.extname(filePaths[0]!))
    //     : "dataset";
    // const catalogTitle = (rootReadme && mdTitle(rootReadme)) ?? titleFromStem(primaryStem);
    // const catalogDesc = rootReadme ? mdDescription(rootReadme) : null;
    // const { totalBytes, newestModified } = summarizeInputs(filePaths);

    // // ── 6. Build datasets from shapefile groups ───────────────────────────────
    // const datasets: Dataset[] = [];

    // for (const [stem, companions] of shapeGroups) {
    //     log(`  Shapefile group: ${stem}`);
    //     const title = titleFromStem(path.basename(stem));
    //     const shpAbs = path.join(tmpDir, stem + ".shp");
    //     const shpStats = fs.existsSync(shpAbs) ? fs.statSync(shpAbs) : null;

    //     const distributions: Distribution[] = companions.map(rel => {
    //         const ext = path.extname(rel).toLowerCase();
    //         const stats = fs.statSync(path.join(tmpDir, rel));
    //         return {
    //             uri: `${baseUri}${rel}`,
    //             title: `${title} (${ext.slice(1).toUpperCase()})`,
    //             accessURL: `${baseUri}${rel}`,
    //             mediaType: MEDIA_TYPES[ext] ?? "application/octet-stream",
    //             byteSize: stats.size,
    //             modified: stats.mtime.toISOString(),
    //         };
    //     });

    //     datasets.push({
    //         uri: `${baseUri}${stem}`,
    //         title,
    //         keyword: ["geospatial", "shapefile", "vector"],
    //         distribution: distributions,
    //         modified: shpStats?.mtime.toISOString(),
    //     });
    // }

    // // ── 7. Build datasets from directory groups ───────────────────────────────
    // for (const [dir, files] of dirGroups) {
    //     const dirAbs = path.join(tmpDir, dir === "." ? "" : dir);
    //     const dirReadme = readReadme(dir === "." ? tmpDir : dirAbs);
    //     const dirLabel = dir === "." ? primaryStem : path.basename(dir);
    //     const datasetTitle = (dirReadme && mdTitle(dirReadme)) ?? titleFromStem(dirLabel);
    //     const datasetDesc = dirReadme ? mdDescription(dirReadme) : null;

    //     const allKeywords = new Set<string>();
    //     const distributions: Distribution[] = [];
    //     let newestModified = "";

    //     for (const relFile of files) {
    //         const absFile = path.join(tmpDir, relFile);
    //         const ext = path.extname(relFile).toLowerCase();
    //         const stats = fs.statSync(absFile);

    //         log(`  Inspecting: ${relFile}`);
    //         const inferred = inspectFile(absFile);
    //         const keywords = extractKeywords(inferred, ext, relFile);
    //         keywords.forEach(k => allKeywords.add(k));

    //         if (stats.mtime.toISOString() > newestModified) {
    //             newestModified = stats.mtime.toISOString();
    //         }

    //         const dist: Distribution = {
    //             uri: `${baseUri}${relFile}`,
    //             title: titleFromStem(path.basename(relFile, ext)),
    //             accessURL: `${baseUri}${relFile}`,
    //             mediaType: MEDIA_TYPES[ext] ?? "application/octet-stream",
    //             byteSize: stats.size,
    //             modified: stats.mtime.toISOString(),
    //         };

    //         if (DCAT_FORMAT_IRIS[ext]) dist.format = DCAT_FORMAT_IRIS[ext];
    //         // if (Object.keys(inferred).length) dist._inferred = inferred;

    //         // Promote PDF title
    //         if (ext === ".pdf" && typeof inferred.title === "string") {
    //             dist.title = inferred.title;
    //             dist.description = typeof inferred.description === "string" ? inferred.description : undefined;
    //         }

    //         distributions.push(dist);
    //     }

    //     if (distributions.length === 0) continue;

    //     datasets.push({
    //         uri: `${baseUri}${dir === "." ? primaryStem : dir}/`,
    //         title: datasetTitle,
    //         description: datasetDesc ?? undefined,
    //         keyword: [...allKeywords],
    //         distribution: distributions,
    //         modified: newestModified || undefined,
    //     });
    // }

    // // ── 8. Assemble catalog ───────────────────────────────────────────────────
    // const sourceFiles = filePaths.map((filePath) => path.basename(filePath));
    // const catalog: Catalog = {
    //     uri: `${baseUri}${primaryStem}/catalog`,
    //     title: catalogTitle,
    //     description: catalogDesc ?? undefined,
    //     issued: newestModified ?? new Date().toISOString(),
    //     dataset: datasets,
    //     _meta: {
    //         sourceFile: sourceFiles[0],
    //         sourceFiles,
    //         totalBytes,
    //         totalFiles: allFiles.length,
    //         dataFiles: dataFiles.length,
    //         skippedFiles: skipSet.size,
    //         shapefileGroups: shapeGroups.size,
    //         inferredWith: "fileprocesser.ts",
    //     },
    // };

    // Cleanup 
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // return catalog;
}

export function inferDcat(zipPath: string, opts: InferOptions = {}) {
    return inferDcatFromFiles([zipPath], opts);
}
