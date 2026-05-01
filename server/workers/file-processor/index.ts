import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { Catalog, Dataset, Distribution, InferOptions } from "../../../shared/types/dcat3.js";
import { MEDIA_TYPES, SHAPEFILE_EXTS, SKIP_FILES, DCAT_FORMAT_IRIS } from "./constants.js";
import { inspectFile } from "./inspectors.js";
import { extractKeywords } from "./keywords.js";
import { readReadme, mdTitle, titleFromStem, mdDescription, walk } from "./helpers.js";

export function inferDcat(zipPath: string, opts: InferOptions = {}): Catalog {
    const baseUri = (opts.baseUri ?? "https://example.org/datasets/").replace(/\/$/, "/");
    const verbose = opts.verbose ?? false;
    const log = (msg: string) => { if (verbose) process.stderr.write(msg + "\n"); };

    // ── 1. Extract ────────────────────────────────────────────────────────────
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dcat-infer-"));
    log(`Extracting ${zipPath} → ${tmpDir}`);
    try {
        execSync(`unzip -q -o "${zipPath}" -d "${tmpDir}"`, { stdio: "pipe" });
    } catch (e: any) {
        throw new Error(`Failed to extract zip: ${e.message}`);
    }

    // ── 2. Enumerate all relative paths ───────────────────────────────────────
    const allFiles = walk(tmpDir);
    log(`Found ${allFiles.length} total files`);

    // ── 3. Partition: skip meta-only files, separate shapefile companions ──────
    const skipSet = new Set(allFiles.filter(f => SKIP_FILES.has(path.basename(f).toLowerCase())));
    const dataFiles = allFiles.filter(f => !skipSet.has(f));

    // Find shapefile groups (stem → companions)
    const shapeGroups = new Map<string, string[]>();
    const nonShapeFiles: string[] = [];

    for (const f of dataFiles) {
        const ext = path.extname(f).toLowerCase();
        const stem = f.slice(0, f.length - ext.length);
        if (SHAPEFILE_EXTS.has(ext)) {
            if (!shapeGroups.has(stem)) shapeGroups.set(stem, []);
            shapeGroups.get(stem)!.push(f);
        } else {
            nonShapeFiles.push(f);
        }
    }

    // ── 4. Group remaining files by their parent directory ────────────────────
    const dirGroups = new Map<string, string[]>();
    for (const f of nonShapeFiles) {
        const dir = path.dirname(f);  // "." for root files
        if (!dirGroups.has(dir)) dirGroups.set(dir, []);
        dirGroups.get(dir)!.push(f);
    }

    // ── 5. Catalog-level README ───────────────────────────────────────────────
    const rootReadme = readReadme(tmpDir);
    const zipStem = path.basename(zipPath, path.extname(zipPath));
    const catalogTitle = (rootReadme && mdTitle(rootReadme)) ?? titleFromStem(zipStem);
    const catalogDesc = rootReadme ? mdDescription(rootReadme) : null;
    const zipStats = fs.statSync(zipPath);

    // ── 6. Build datasets from shapefile groups ───────────────────────────────
    const datasets: Dataset[] = [];

    for (const [stem, companions] of shapeGroups) {
        log(`  Shapefile group: ${stem}`);
        const title = titleFromStem(path.basename(stem));
        const shpAbs = path.join(tmpDir, stem + ".shp");
        const shpStats = fs.existsSync(shpAbs) ? fs.statSync(shpAbs) : null;

        const distributions: Distribution[] = companions.map(rel => {
            const ext = path.extname(rel).toLowerCase();
            const stats = fs.statSync(path.join(tmpDir, rel));
            return {
                uri: `${baseUri}${rel}`,
                title: `${title} (${ext.slice(1).toUpperCase()})`,
                accessURL: `${baseUri}${rel}`,
                mediaType: MEDIA_TYPES[ext] ?? "application/octet-stream",
                byteSize: stats.size,
                modified: stats.mtime.toISOString(),
            };
        });

        datasets.push({
            uri: `${baseUri}${stem}`,
            title,
            keyword: ["geospatial", "shapefile", "vector"],
            distribution: distributions,
            modified: shpStats?.mtime.toISOString(),
            _inferred: { format: "ESRI Shapefile", companions },
        });
    }

    // ── 7. Build datasets from directory groups ───────────────────────────────
    for (const [dir, files] of dirGroups) {
        const dirAbs = path.join(tmpDir, dir === "." ? "" : dir);
        const dirReadme = readReadme(dir === "." ? tmpDir : dirAbs);
        const dirLabel = dir === "." ? zipStem : path.basename(dir);
        const datasetTitle = (dirReadme && mdTitle(dirReadme)) ?? titleFromStem(dirLabel);
        const datasetDesc = dirReadme ? mdDescription(dirReadme) : null;

        const allKeywords = new Set<string>();
        const distributions: Distribution[] = [];
        let newestModified = "";

        for (const relFile of files) {
            const absFile = path.join(tmpDir, relFile);
            const ext = path.extname(relFile).toLowerCase();
            const stats = fs.statSync(absFile);

            log(`  Inspecting: ${relFile}`);
            const inferred = inspectFile(absFile);
            const keywords = extractKeywords(inferred, ext, relFile);
            keywords.forEach(k => allKeywords.add(k));

            if (stats.mtime.toISOString() > newestModified) {
                newestModified = stats.mtime.toISOString();
            }

            const dist: Distribution = {
                uri: `${baseUri}${relFile}`,
                title: titleFromStem(path.basename(relFile, ext)),
                accessURL: `${baseUri}${relFile}`,
                mediaType: MEDIA_TYPES[ext] ?? "application/octet-stream",
                byteSize: stats.size,
                modified: stats.mtime.toISOString(),
            };

            if (DCAT_FORMAT_IRIS[ext]) dist.format = DCAT_FORMAT_IRIS[ext];
            if (Object.keys(inferred).length) dist._inferred = inferred;

            // Promote PDF title
            if (ext === ".pdf" && typeof inferred.Title === "string") {
                dist.title = inferred.Title;
                dist.description = typeof inferred.Subject === "string" ? inferred.Subject : undefined;
            }

            distributions.push(dist);
        }

        if (distributions.length === 0) continue;

        datasets.push({
            uri: `${baseUri}${dir === "." ? zipStem : dir}/`,
            title: datasetTitle,
            description: datasetDesc ?? undefined,
            keyword: [...allKeywords],
            distribution: distributions,
            modified: newestModified || undefined,
            _inferred: { fileCount: files.length, directory: dir },
        });
    }

    // ── 8. Assemble catalog ───────────────────────────────────────────────────
    const catalog: Catalog = {
        uri: `${baseUri}${zipStem}/catalog`,
        title: catalogTitle,
        description: catalogDesc ?? undefined,
        issued: zipStats.mtime.toISOString(),
        dataset: datasets,
        _meta: {
            sourceFile: path.basename(zipPath),
            totalFiles: allFiles.length,
            dataFiles: dataFiles.length,
            skippedFiles: skipSet.size,
            shapefileGroups: shapeGroups.size,
            inferredWith: "fileprocesser.ts",
        },
    };

    // ── 9. Cleanup ────────────────────────────────────────────────────────────
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return catalog;
}
