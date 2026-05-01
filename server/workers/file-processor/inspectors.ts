import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import type { Distribution } from "../../../shared/types/dcat3.js";

function baseDistribution(filePath: string): Distribution {
    return { accessURL: filePath };
}

function inspectCsv(filePath: string): Distribution {
    try {
        const content = fs.readFileSync(filePath, "utf8");
        const lines = content.split(/\r?\n/).filter(Boolean);
        if (lines.length === 0) return baseDistribution(filePath);

        const firstLine = lines[0]!;
        const delimiter = firstLine.includes("\t") ? "\t"
            : firstLine.includes(";") ? ";"
                : ",";

        const headers = firstLine.split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ""));
        const rowCount = lines.length - 1;
        const geoHints = headers.filter(h =>
            /^(lat|latitude|lon|lng|longitude|x|y|geometry|geom|wkt|bbox)$/i.test(h)
        );

        const descriptionParts = [
            `Columns: ${headers.join(", ")}`,
            `Row count: ${rowCount}`,
            `Delimiter: ${delimiter === "\t" ? "tab" : delimiter}`,
        ];
        if (geoHints.length > 0) descriptionParts.push(`Geo columns: ${geoHints.join(", ")}`);

        return {
            ...baseDistribution(filePath),
            description: descriptionParts.join("; "),
        };
    } catch { return baseDistribution(filePath); }
}

function inspectJson(filePath: string): Distribution {
    try {
        const raw = fs.readFileSync(filePath, "utf8");
        const parsed = JSON.parse(raw);

        if (parsed?.type === "FeatureCollection") {
            const features = parsed.features ?? [];
            return {
                ...baseDistribution(filePath),
                description: [
                    "JSON type: GeoJSON FeatureCollection",
                    `Feature count: ${features.length}`,
                    `Properties: ${(features[0] ? Object.keys(features[0]?.properties ?? {}) : []).join(", ")}`,
                    `CRS: ${parsed.crs?.properties?.name ?? "unknown"}`,
                ].join("; "),
            };
        }
        if (Array.isArray(parsed)) {
            return {
                ...baseDistribution(filePath),
                description: [
                    "JSON type: array",
                    `Item count: ${parsed.length}`,
                    `Keys: ${typeof parsed[0] === "object" && parsed[0] !== null ? Object.keys(parsed[0]).join(", ") : ""}`,
                ].join("; "),
            };
        }
        if (typeof parsed === "object" && parsed !== null) {
            // Detect JSON-LD inline
            if (parsed["@context"]) {
                return {
                    ...baseDistribution(filePath),
                    description: [
                        "JSON type: JSON-LD",
                        `Context: ${typeof parsed["@context"] === "string" ? parsed["@context"] : "[object]"}`,
                        `RDF type: ${typeof parsed["@type"] === "string" ? parsed["@type"] : ""}`,
                    ].join("; "),
                };
            }
            return {
                ...baseDistribution(filePath),
                description: [
                    "JSON type: object",
                    `Keys: ${Object.keys(parsed).join(", ")}`,
                ].join("; "),
            };
        }
        return { ...baseDistribution(filePath), description: `JSON type: ${typeof parsed}` };
    } catch { return baseDistribution(filePath); }
}

function inspectPdf(filePath: string): Distribution {
    try {
        const result = spawnSync("pdfinfo", [filePath], { encoding: "utf8" });
        if (result.status !== 0 || !result.stdout) return baseDistribution(filePath);
        const meta: Record<string, string> = {};
        for (const line of result.stdout.split("\n")) {
            const colonIdx = line.indexOf(":");
            if (colonIdx === -1) continue;
            const key = line.slice(0, colonIdx).trim();
            const val = line.slice(colonIdx + 1).trim();
            if (val && ["Title", "Author", "Subject", "Keywords", "Creator", "Pages", "CreationDate", "ModDate"].includes(key)) {
                meta[key] = val;
            }
        }
        return {
            ...baseDistribution(filePath),
            title: meta.Title,
            description: meta.Subject,
        };
    } catch { return baseDistribution(filePath); }
}

function inspectImage(filePath: string): Distribution {
    try {
        const r = spawnSync("identify", [filePath], { encoding: "utf8" });
        if (!r.stdout) return baseDistribution(filePath);
        // "path.png PNG 1920x1080 1920x1080+0+0 8-bit sRGB 2.1MB 0.000u 0:00.000"
        const parts = r.stdout.trim().split(/\s+/);
        return {
            ...baseDistribution(filePath),
            description: `Image format: ${parts[1]}; Dimensions: ${parts[2]}; Depth: ${parts[4]}; Colorspace: ${parts[5]}`,
        };
    } catch { return baseDistribution(filePath); }
}

function inspectXml(filePath: string): Distribution {
    try {
        const head = fs.readFileSync(filePath, "utf8").slice(0, 2000);
        const rootMatch = head.match(/<([a-zA-Z][a-zA-Z0-9_:.-]*)/);
        const nsMatches = [...head.matchAll(/xmlns(?::[^=]+)?="([^"]+)"/g)].map(m => m[1]);
        return {
            ...baseDistribution(filePath),
            description: `Root element: ${rootMatch?.[1] ?? "unknown"}; Namespaces: ${nsMatches.join(", ")}`,
        };
    } catch { return baseDistribution(filePath); }
}

function inspectParquet(filePath: string): Distribution {
    try {
        const buf = Buffer.alloc(4);
        const fd = fs.openSync(filePath, "r");
        fs.readSync(fd, buf, 0, 4, 0);
        fs.closeSync(fd);
        const magic = buf.toString("ascii");
        return magic === "PAR1"
            ? { ...baseDistribution(filePath), description: "Format: Apache Parquet" }
            : baseDistribution(filePath);
    } catch { return baseDistribution(filePath); }
}

function inspectTurtle(filePath: string): Distribution {
    try {
        const content = fs.readFileSync(filePath, "utf8");
        const prefixes = [...content.matchAll(/@prefix\s+(\S+):\s+<([^>]+)>/g)]
            .map(m => ({ prefix: m[1], iri: m[2] }));
        const tripleLines = content.split("\n").filter(l =>
            l.trim() && !l.trim().startsWith("#") && !l.trim().startsWith("@")
        );
        return {
            ...baseDistribution(filePath),
            description: [
                `Estimated triples: ${tripleLines.length}`,
                `Prefixes: ${prefixes.map(p => `${p.prefix}: ${p.iri}`).join(", ")}`,
            ].join("; "),
        };
    } catch { return baseDistribution(filePath); }
}

export function inspectFile(filePath: string): Distribution {
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
        default: return baseDistribution(filePath);
    }
}
