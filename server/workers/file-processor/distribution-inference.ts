import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { DCAT_FORMAT_IRIS, MEDIA_TYPES } from "./constants.js";
import { inspectFile } from "./inspectors.js";
import { titleFromStem } from "./helpers.js";

const LICENSE_IRIS: Array<{ pattern: RegExp; iri: string }> = [
    { pattern: /\bMIT\b/i, iri: "https://spdx.org/licenses/MIT.html" },
    { pattern: /Apache\s*License,?\s*Version\s*2\.0|Apache\s*2\.0/i, iri: "https://spdx.org/licenses/Apache-2.0.html" },
    { pattern: /GNU\s+GENERAL\s+PUBLIC\s+LICENSE\s+Version\s+3|GPL\s*3\.0/i, iri: "https://spdx.org/licenses/GPL-3.0-only.html" },
    { pattern: /GNU\s+GENERAL\s+PUBLIC\s+LICENSE\s+Version\s+2|GPL\s*2\.0/i, iri: "https://spdx.org/licenses/GPL-2.0-only.html" },
    { pattern: /CC[-\s]?BY[-\s]?4\.0|Creative\s+Commons\s+Attribution\s+4\.0/i, iri: "https://creativecommons.org/licenses/by/4.0/" },
    { pattern: /CC0\s*1\.0|Creative\s+Commons\s+Zero\s+1\.0/i, iri: "https://creativecommons.org/publicdomain/zero/1.0/" },
    { pattern: /Open\s+Data\s+Commons\s+Attribution|ODC[-\s]?By/i, iri: "https://opendatacommons.org/licenses/by/1-0/" },
];

const LANGUAGE_IRIS: Record<string, string> = {
    english: "http://id.loc.gov/vocabulary/iso639-1/en",
    french: "http://id.loc.gov/vocabulary/iso639-1/fr",
    german: "http://id.loc.gov/vocabulary/iso639-1/de",
    spanish: "http://id.loc.gov/vocabulary/iso639-1/es",
    italian: "http://id.loc.gov/vocabulary/iso639-1/it",
    portuguese: "http://id.loc.gov/vocabulary/iso639-1/pt",
    dutch: "http://id.loc.gov/vocabulary/iso639-1/nl",
};

const CONFORMS_TO_BY_EXT: Record<string, string> = {
    ".csv": "https://www.rfc-editor.org/rfc/rfc4180",
    ".json": "https://www.rfc-editor.org/rfc/rfc8259",
    ".geojson": "https://www.rfc-editor.org/rfc/rfc7946",
    ".xml": "https://www.w3.org/TR/xml/",
};

export type DistributionDeterministicInput = {
    filePath: string;
    sourceInfo?: { accessUrl?: string; downloadUrl?: string };
    originalName?: string;
};

export type DistributionMetadata = {
    description: string | null;
    license: string | null;
    rights: string | null;
    language: string | null;
    conformsTo: string | null;
    temporal: { startDate?: string; endDate?: string } | null;
    temporalResolution: string | null;
    spatial: { bbox?: string; centroid?: string } | null;
    spatialResolutionInMeters: number | null;
    uri: string;
    accessURL: string;
    downloadURL: string | null;
    title: string;
    mediaType: string;
    format: string | null;
    packageFormat: string | null;
    compressFormat: string | null;
    byteSize: number;
    modified: string;
    issued: string | null;
};

function readFirstExistingFile(paths: string[]): string | null {
    for (const filePath of paths) {
        if (!fs.existsSync(filePath)) continue;
        try {
            return fs.readFileSync(filePath, "utf8").slice(0, 4000);
        } catch {
            continue;
        }
    }
    return null;
}

function readNearbyLicense(filePath: string): string | null {
    const dir = path.dirname(filePath);
    const parent = path.dirname(dir);
    const names = ["LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING", "COPYING.txt"];
    const localPaths = names.map(name => path.join(dir, name));
    const parentPaths = names.map(name => path.join(parent, name));
    return readFirstExistingFile([...localPaths, ...parentPaths]);
}

function readNearbyReadme(filePath: string): string | null {
    const dir = path.dirname(filePath);
    for (const name of ["README.md", "README.txt", "readme.md", "readme.txt", "README"]) {
        const p = path.join(dir, name);
        if (fs.existsSync(p)) {
            try {
                return fs.readFileSync(p, "utf8").slice(0, 3000);
            } catch {
                continue;
            }
        }
    }
    const parent = path.dirname(dir);
    for (const name of ["README.md", "README.txt", "readme.md", "readme.txt", "README"]) {
        const p = path.join(parent, name);
        if (fs.existsSync(p)) {
            try {
                return fs.readFileSync(p, "utf8").slice(0, 3000);
            } catch {
                continue;
            }
        }
    }
    return null;
}

function inferLicenseIri(text: string | null): string | null {
    if (!text) return null;
    for (const entry of LICENSE_IRIS) {
        if (entry.pattern.test(text)) return entry.iri;
    }
    return null;
}

function inferRights(text: string | null): string | null {
    if (!text) return null;
    for (const line of text.split("\n")) {
        const match = line.match(/^rights?\s*:\s*(.+)$/i);
        if (match?.[1]) return match[1].trim();
    }
    return null;
}

function inferLanguageIri(text: string | null): string | null {
    if (!text) return null;
    for (const line of text.split("\n")) {
        const match = line.match(/^language\s*:\s*(.+)$/i);
        if (match?.[1]) {
            const normalized = match[1].trim().toLowerCase();
            return LANGUAGE_IRIS[normalized] ?? null;
        }
    }
    return null;
}

function inferTemporalFromText(text: string | null): { startDate?: string; endDate?: string } | null {
    if (!text) return null;
    const years = [...text.matchAll(/\b(19|20)\d{2}\b/g)].map(match => Number(match[0]));
    if (years.length === 0) return null;
    const sorted = [...new Set(years)].sort((a, b) => a - b);
    if (sorted.length === 1) {
        return { startDate: `${sorted[0]}-01-01` };
    }
    return { startDate: `${sorted[0]}-01-01`, endDate: `${sorted[sorted.length - 1]}-12-31` };
}

function inferSpatialFromText(text: string | null): { bbox?: string; centroid?: string } | null {
    if (!text) return null;
    const bboxMatch = text.match(/bbox\s*:\s*([^\n]+)/i);
    const centroidMatch = text.match(/centroid\s*:\s*([^\n]+)/i);
    if (!bboxMatch && !centroidMatch) return null;
    return {
        bbox: bboxMatch?.[1]?.trim(),
        centroid: centroidMatch?.[1]?.trim(),
    };
}

function inferTemporalResolution(text: string | null): string | null {
    if (!text) return null;
    const match = text.match(/temporal\s+resolution\s*:\s*([^\n]+)/i);
    return match?.[1]?.trim() ?? null;
}

function inferSpatialResolution(text: string | null): number | null {
    if (!text) return null;
    const match = text.match(/spatial\s+resolution\s*:\s*(\d+(?:\.\d+)?)\s*m/i);
    if (!match?.[1]) return null;
    return Number(match[1]);
}

export function inferDistributionMetadata(input: DistributionDeterministicInput): DistributionMetadata {
    const fileUrl = pathToFileURL(input.filePath).toString();
    const displayName = input.originalName ? path.basename(input.originalName) : path.basename(input.filePath);
    const displayExt = path.extname(displayName).toLowerCase();
    const ext = displayExt || path.extname(input.filePath).toLowerCase();
    const stats = fs.statSync(input.filePath);
    const readmeText = readNearbyReadme(input.filePath);
    const licenseText = readNearbyLicense(input.filePath);
    const description = inspectFile(input.filePath).description ?? null;
    const mediaType = MEDIA_TYPES[ext] ?? "application/octet-stream";
    const packageFormat = ext === ".zip" || ext === ".tar" ? mediaType : null;
    const compressFormat = ext === ".gz" ? mediaType : null;
    const titleStem = displayName.replace(new RegExp(`${ext.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}$`, "i"), "");

    return {
        description,
        license: inferLicenseIri(licenseText ?? readmeText),
        rights: inferRights(readmeText),
        language: inferLanguageIri(readmeText),
        conformsTo: CONFORMS_TO_BY_EXT[ext] ?? null,
        temporal: inferTemporalFromText(titleStem) ?? inferTemporalFromText(readmeText),
        temporalResolution: inferTemporalResolution(readmeText),
        spatial: inferSpatialFromText(readmeText),
        spatialResolutionInMeters: inferSpatialResolution(readmeText),
        uri: fileUrl,
        accessURL: input.sourceInfo?.accessUrl ?? fileUrl,
        downloadURL: input.sourceInfo?.downloadUrl ?? null,
        title: `${titleFromStem(titleStem)}${ext ? ` (${ext.slice(1).toUpperCase()})` : ""}`,
        mediaType,
        format: DCAT_FORMAT_IRIS[ext] ?? null,
        packageFormat,
        compressFormat,
        byteSize: stats.size,
        modified: stats.mtime.toISOString(),
        issued: Number.isNaN(stats.birthtime.getTime()) ? null : stats.birthtime.toISOString(),
    };
}