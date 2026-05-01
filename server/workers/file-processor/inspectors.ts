import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

function inspectCsv(filePath: string): Record<string, unknown> {
    try {
        const content = fs.readFileSync(filePath, "utf8");
        const lines = content.split(/\r?\n/).filter(Boolean);
        if (lines.length === 0) return {};

        const firstLine = lines[0]!;
        const delimiter = firstLine.includes("\t") ? "\t"
            : firstLine.includes(";") ? ";"
                : ",";

        const headers = firstLine.split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ""));
        const rowCount = lines.length - 1;
        const geoHints = headers.filter(h =>
            /^(lat|latitude|lon|lng|longitude|x|y|geometry|geom|wkt|bbox)$/i.test(h)
        );

        return {
            columns: headers,
            columnCount: headers.length,
            rowCount,
            delimiter: delimiter === "\t" ? "tab" : delimiter,
            geoColumns: geoHints.length > 0 ? geoHints : undefined,
            sampleValues: lines.slice(1, 4).map(l => l.split(delimiter)[0]?.trim()),
        };
    } catch { return {}; }
}

function inspectJson(filePath: string): Record<string, unknown> {
    try {
        const raw = fs.readFileSync(filePath, "utf8");
        const parsed = JSON.parse(raw);

        if (parsed?.type === "FeatureCollection") {
            const features = parsed.features ?? [];
            return {
                jsonType: "GeoJSON FeatureCollection",
                featureCount: features.length,
                properties: features[0] ? Object.keys(features[0]?.properties ?? {}) : [],
                crs: parsed.crs?.properties?.name ?? null,
            };
        }
        if (Array.isArray(parsed)) {
            return {
                jsonType: "array",
                itemCount: parsed.length,
                keys: typeof parsed[0] === "object" && parsed[0] !== null
                    ? Object.keys(parsed[0])
                    : [],
            };
        }
        if (typeof parsed === "object" && parsed !== null) {
            // Detect JSON-LD inline
            if (parsed["@context"]) {
                return { jsonType: "JSON-LD", context: parsed["@context"], rdfType: parsed["@type"] };
            }
            return { jsonType: "object", keys: Object.keys(parsed) };
        }
        return { jsonType: typeof parsed };
    } catch { return {}; }
}

function inspectPdf(filePath: string): Record<string, unknown> {
    try {
        const result = spawnSync("pdfinfo", [filePath], { encoding: "utf8" });
        if (result.status !== 0 || !result.stdout) return {};
        const meta: Record<string, unknown> = {};
        for (const line of result.stdout.split("\n")) {
            const colonIdx = line.indexOf(":");
            if (colonIdx === -1) continue;
            const key = line.slice(0, colonIdx).trim();
            const val = line.slice(colonIdx + 1).trim();
            if (val && ["Title", "Author", "Subject", "Keywords", "Creator", "Pages", "CreationDate", "ModDate"].includes(key)) {
                meta[key] = val;
            }
        }
        return meta;
    } catch { return {}; }
}

function inspectImage(filePath: string): Record<string, unknown> {
    try {
        const r = spawnSync("identify", [filePath], { encoding: "utf8" });
        if (!r.stdout) return {};
        // "path.png PNG 1920x1080 1920x1080+0+0 8-bit sRGB 2.1MB 0.000u 0:00.000"
        const parts = r.stdout.trim().split(/\s+/);
        return { format: parts[1], dimensions: parts[2], depth: parts[4], colorspace: parts[5] };
    } catch { return {}; }
}

function inspectXml(filePath: string): Record<string, unknown> {
    try {
        const head = fs.readFileSync(filePath, "utf8").slice(0, 2000);
        const rootMatch = head.match(/<([a-zA-Z][a-zA-Z0-9_:.-]*)/);
        const nsMatches = [...head.matchAll(/xmlns(?::[^=]+)?="([^"]+)"/g)].map(m => m[1]);
        return { rootElement: rootMatch?.[1] ?? null, namespaces: nsMatches };
    } catch { return {}; }
}

function inspectParquet(filePath: string): Record<string, unknown> {
    try {
        const buf = Buffer.alloc(4);
        const fd = fs.openSync(filePath, "r");
        fs.readSync(fd, buf, 0, 4, 0);
        fs.closeSync(fd);
        const magic = buf.toString("ascii");
        return magic === "PAR1" ? { magic, format: "Apache Parquet" } : {};
    } catch { return {}; }
}

function inspectTurtle(filePath: string): Record<string, unknown> {
    try {
        const content = fs.readFileSync(filePath, "utf8");
        const prefixes = [...content.matchAll(/@prefix\s+(\S+):\s+<([^>]+)>/g)]
            .map(m => ({ prefix: m[1], iri: m[2] }));
        const tripleLines = content.split("\n").filter(l =>
            l.trim() && !l.trim().startsWith("#") && !l.trim().startsWith("@")
        );
        return { estimatedTriples: tripleLines.length, prefixes };
    } catch { return {}; }
}

export function inspectFile(filePath: string): Record<string, unknown> {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case ".csv":
        case ".tsv": return inspectCsv(filePath);
        case ".json":
        case ".geojson": return inspectJson(filePath);
        case ".jsonld": return inspectJson(filePath);
        case ".xml":
        case ".rdf": return inspectXml(filePath);
        case ".ttl":
        case ".n3":
        case ".nt": return inspectTurtle(filePath);
        case ".pdf": return inspectPdf(filePath);
        case ".png":
        case ".jpg":
        case ".jpeg":
        case ".tif":
        case ".tiff": return inspectImage(filePath);
        case ".parquet": return inspectParquet(filePath);
        default: return {};
    }
}
