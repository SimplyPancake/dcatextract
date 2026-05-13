import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import type { Distribution } from "../../../shared/types/dcat3.js";
import { DCAT_FORMAT_IRIS, MEDIA_TYPES } from "./constants.js";
import { inspectFile } from "./inspectors.js";
import * as builders from "../../../shared/utils/builder";
import { extractFileText, readReadme, titleFromStem } from "./helpers.js";
import { processDCATDescription, processDistributionMetadata } from "./ai-derive.js";

type SelectionGuard = {
    hasSelection: (prefix: string) => boolean;
    isSelected: (key: string) => boolean;
};

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

const CONFIDENCE = {
    system: 0.95,
    heuristic: 0.85,
    inspection: 0.75,
    ai: 0.6,
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
    return readReadme(dir) ?? readReadme(path.dirname(dir));
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

export function createSelectionGuard(selectedProperties?: Record<string, boolean>): SelectionGuard {
    const keys = selectedProperties ? Object.keys(selectedProperties) : [];

    const hasSelection = (prefix: string): boolean => {
        if (keys.length === 0) return true;
        const prefixWithDot = `${prefix}.`;
        return keys.some(key => key === prefix || key.startsWith(prefixWithDot));
    };

    const isSelected = (key: string): boolean => {
        if (keys.length === 0) return true;
        return !!selectedProperties?.[key];
    };

    return { hasSelection, isSelected };
}

export async function buildDistributionFromFile(
    filePath: string,
    selection: SelectionGuard,
    log: (msg: string) => void,
    sourceInfo?: { accessUrl?: string; downloadUrl?: string },
    originalName?: string
): Promise<{ distribution: Distribution; confidence: Record<string, number> }> {
    const fileUrl = pathToFileURL(filePath).toString();
    const accessUrl = sourceInfo?.accessUrl ?? fileUrl;
    const distributionBuilder = new builders.DistributionBuilder(accessUrl);
    const displayName = originalName ? path.basename(originalName) : path.basename(filePath);
    const displayExt = path.extname(displayName).toLowerCase();
    const ext = displayExt || path.extname(filePath).toLowerCase();
    const mediaType = MEDIA_TYPES[ext] ?? "application/octet-stream";
    const packageFormat = ext === ".zip" || ext === ".tar" ? mediaType : undefined;
    const compressFormat = ext === ".gz" ? mediaType : undefined;
    const filename = displayName;
    const wantsDescription = selection.isSelected("distribution.description");
    const wantsLicense = selection.isSelected("distribution.license");
    const wantsRights = selection.isSelected("distribution.rights");
    const wantsLanguage = selection.isSelected("distribution.language");
    const wantsConformsTo = selection.isSelected("distribution.conformsTo");
    const wantsTemporal = selection.isSelected("distribution.temporal");
    const wantsTemporalResolution = selection.isSelected("distribution.temporalResolution");
    const wantsSpatial = selection.isSelected("distribution.spatial");
    const wantsSpatialResolution = selection.isSelected("distribution.spatialResolutionInMeters");
    const confidence: Record<string, number> = {};
    const setConfidence = (key: string, value: number) => {
        confidence[key] = value;
    };

    if (selection.isSelected("distribution.accessURL")) {
        setConfidence("distribution.accessURL", CONFIDENCE.system);
    }

    const needsReadme = wantsRights
        || wantsLanguage
        || wantsTemporal
        || wantsTemporalResolution
        || wantsSpatial
        || wantsSpatialResolution;
    const needsLicenseText = wantsLicense;
    const readmeText = needsReadme ? readNearbyReadme(filePath) : null;
    const licenseText = needsLicenseText ? readNearbyLicense(filePath) : null;
    const licenseIri = wantsLicense ? inferLicenseIri(licenseText ?? readmeText) : null;
    const rightsText = wantsRights ? inferRights(readmeText) : null;
    const languageIri = wantsLanguage ? inferLanguageIri(readmeText) : null;
    const conformsToIri = wantsConformsTo ? CONFORMS_TO_BY_EXT[ext] ?? null : null;
    const temporalFromName = wantsTemporal ? inferTemporalFromText(filename) : null;
    const temporalFromReadme = wantsTemporal ? inferTemporalFromText(readmeText) : null;
    const temporal = temporalFromName ?? temporalFromReadme;
    const temporalResolution = wantsTemporalResolution ? inferTemporalResolution(readmeText) : null;
    const spatialResolution = wantsSpatialResolution ? inferSpatialResolution(readmeText) : null;
    const spatial = wantsSpatial ? inferSpatialFromText(readmeText) : null;
    let fileContent: string | null = null;

    if (selection.isSelected("distribution.uri")) {
        distributionBuilder.uri(fileUrl);
        setConfidence("distribution.uri", CONFIDENCE.system);
    }

    if (selection.isSelected("distribution.downloadURL") && sourceInfo?.downloadUrl) {
        distributionBuilder.downloadURL(sourceInfo.downloadUrl);
        setConfidence("distribution.downloadURL", CONFIDENCE.system);
    }

    if (selection.isSelected("distribution.title")) {
        const title = titleFromStem(path.basename(displayName, ext));
        distributionBuilder.title(`${title} (${ext.slice(1).toUpperCase()})`);
        setConfidence("distribution.title", CONFIDENCE.heuristic);
    }

    if (selection.isSelected("distribution.mediaType")) {
        distributionBuilder.mediaType(mediaType);
        setConfidence("distribution.mediaType", CONFIDENCE.system);
    }

    if (selection.isSelected("distribution.format")) {
        const formatIri = DCAT_FORMAT_IRIS[ext];
        if (formatIri) {
            distributionBuilder.format(formatIri);
            setConfidence("distribution.format", CONFIDENCE.system);
        }
    }

    if (selection.isSelected("distribution.packageFormat") && packageFormat) {
        distributionBuilder.packageFormat(packageFormat);
        setConfidence("distribution.packageFormat", CONFIDENCE.system);
    }

    if (selection.isSelected("distribution.compressFormat") && compressFormat) {
        distributionBuilder.compressFormat(compressFormat);
        setConfidence("distribution.compressFormat", CONFIDENCE.system);
    }

    if (selection.isSelected("distribution.license") && licenseIri) {
        distributionBuilder.license(licenseIri);
        setConfidence("distribution.license", CONFIDENCE.heuristic);
    }

    if (selection.isSelected("distribution.rights") && rightsText) {
        distributionBuilder.rights(rightsText);
        setConfidence("distribution.rights", CONFIDENCE.heuristic);
    }

    if (selection.isSelected("distribution.language") && languageIri) {
        distributionBuilder.language(languageIri);
        setConfidence("distribution.language", CONFIDENCE.heuristic);
    }

    if (selection.isSelected("distribution.conformsTo") && conformsToIri) {
        distributionBuilder.conformsTo(conformsToIri);
        setConfidence("distribution.conformsTo", CONFIDENCE.system);
    }

    if (selection.isSelected("distribution.temporal") && temporal) {
        distributionBuilder.temporal(temporal);
        setConfidence("distribution.temporal", CONFIDENCE.heuristic);
    }

    if (selection.isSelected("distribution.temporalResolution") && temporalResolution) {
        distributionBuilder.temporalResolution(temporalResolution);
        setConfidence("distribution.temporalResolution", CONFIDENCE.heuristic);
    }

    if (selection.isSelected("distribution.spatialResolutionInMeters") && spatialResolution !== null) {
        distributionBuilder.spatialResolutionInMeters(spatialResolution);
        setConfidence("distribution.spatialResolutionInMeters", CONFIDENCE.heuristic);
    }

    if (selection.isSelected("distribution.spatial") && spatial) {
        distributionBuilder.spatial(spatial);
        setConfidence("distribution.spatial", CONFIDENCE.heuristic);
    }

    if (
        selection.isSelected("distribution.byteSize")
        || selection.isSelected("distribution.modified")
        || selection.isSelected("distribution.issued")
    ) {
        const stats = fs.statSync(filePath);
        if (selection.isSelected("distribution.byteSize")) {
            distributionBuilder.byteSize(stats.size);
            setConfidence("distribution.byteSize", CONFIDENCE.system);
        }
        if (selection.isSelected("distribution.modified")) {
            distributionBuilder.modified(stats.mtime.toISOString());
            setConfidence("distribution.modified", CONFIDENCE.system);
        }
        if (selection.isSelected("distribution.issued")) {
            const issued = Number.isNaN(stats.birthtime.getTime()) ? null : stats.birthtime.toISOString();
            if (issued) {
                distributionBuilder.issued(issued);
                setConfidence("distribution.issued", CONFIDENCE.system);
            }
        }
    }

    if (wantsDescription) {
        let description = inspectFile(filePath).description;
        const hasDescription = typeof description === "string"
            ? description.trim().length > 0
            : false;

        if (!hasDescription) {
            // AI Parsing
            // TODO: openai api file uploads
            try {
                fileContent = fileContent ?? await extractFileText(filePath, 5000);
                const response = await processDCATDescription(fileContent);
                console.log(response);
                description = response;
            } catch (e: any) {
                log(`Failed to process AI description for ${filePath}`);
                log(e);
            }
        }

        if (typeof description === "string") {
            distributionBuilder.description(description);
            setConfidence("distribution.description", hasDescription ? CONFIDENCE.inspection : CONFIDENCE.ai);
        }
    }

    const needsAiMetadata = (
        (wantsLicense && !licenseIri)
        || (wantsRights && !rightsText)
        || (wantsLanguage && !languageIri)
        || (wantsConformsTo && !conformsToIri)
        || (wantsTemporal && !temporal)
        || (wantsTemporalResolution && !temporalResolution)
        || (wantsSpatialResolution && spatialResolution === null)
        || (wantsSpatial && !spatial)
    );

    if (needsAiMetadata) {
        try {
            fileContent = fileContent ?? await extractFileText(filePath, 5000);
            const aiMeta = await processDistributionMetadata(fileContent, filename);

            if (wantsLicense && !licenseIri && aiMeta.licenseIri) {
                distributionBuilder.license(aiMeta.licenseIri);
                setConfidence("distribution.license", CONFIDENCE.ai);
            }
            if (wantsRights && !rightsText && aiMeta.rights) {
                distributionBuilder.rights(aiMeta.rights);
                setConfidence("distribution.rights", CONFIDENCE.ai);
            }
            if (wantsLanguage && !languageIri && aiMeta.languageIri) {
                distributionBuilder.language(aiMeta.languageIri);
                setConfidence("distribution.language", CONFIDENCE.ai);
            }
            if (wantsConformsTo && !conformsToIri && aiMeta.conformsToIri) {
                distributionBuilder.conformsTo(aiMeta.conformsToIri);
                setConfidence("distribution.conformsTo", CONFIDENCE.ai);
            }
            if (wantsTemporal && !temporal && (aiMeta.temporalStart || aiMeta.temporalEnd)) {
                distributionBuilder.temporal({
                    startDate: aiMeta.temporalStart ?? undefined,
                    endDate: aiMeta.temporalEnd ?? undefined,
                });
                setConfidence("distribution.temporal", CONFIDENCE.ai);
            }
            if (wantsTemporalResolution && !temporalResolution && aiMeta.temporalResolution) {
                distributionBuilder.temporalResolution(aiMeta.temporalResolution);
                setConfidence("distribution.temporalResolution", CONFIDENCE.ai);
            }
            if (wantsSpatialResolution && spatialResolution === null && aiMeta.spatialResolutionInMeters !== null && aiMeta.spatialResolutionInMeters != undefined) {
                distributionBuilder.spatialResolutionInMeters(aiMeta.spatialResolutionInMeters);
                setConfidence("distribution.spatialResolutionInMeters", CONFIDENCE.ai);
            }
            if (wantsSpatial && !spatial && (aiMeta.spatialBboxWkt || aiMeta.spatialCentroidWkt)) {
                distributionBuilder.spatial({
                    bbox: aiMeta.spatialBboxWkt ?? undefined,
                    centroid: aiMeta.spatialCentroidWkt ?? undefined,
                });
                setConfidence("distribution.spatial", CONFIDENCE.ai);
            }
        } catch (e: any) {
            log(`Failed to process AI distribution metadata for ${filePath}`);
            log(e);
        }
    }

    const distribution = distributionBuilder.build();
    console.log(distribution);

    return { distribution, confidence };
}
