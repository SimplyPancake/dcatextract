import { ScoredValue } from "~~/shared/types/workers.js";

export type DistributionResultsFlat = Record<string, ScoredValue<any>>;

/**
 * Extract dataset title from distribution titles.
 * Uses the first distribution's title, stripping file extension wrapper if present.
 */
export function inferDatasetTitle(distributions: DistributionResultsFlat[]): string | null {
    if (distributions.length === 0) return null;
    
    const firstDist = distributions[0];
    if (!firstDist) return null;
    const titleValue = firstDist["distribution.title"]?.value;
    
    if (!titleValue) return null;
    
    // Remove trailing " (EXT)" pattern if present
    return titleValue.replace(/\s+\([A-Z0-9]+\)$/, "").trim();
}

/**
 * Infer dataset license by finding common license across distributions.
 */
export function inferDatasetLicense(distributions: DistributionResultsFlat[]): string | null {
    if (distributions.length === 0) return null;
    
    const licenses = distributions
        .map(d => d["distribution.license"]?.value)
        .filter((l): l is string => typeof l === "string");
    
    if (licenses.length === 0) return null;
    
    // Return the most common license
    const licenseFreq = new Map<string, number>();
    licenses.forEach(l => licenseFreq.set(l, (licenseFreq.get(l) ?? 0) + 1));
    
    let mostCommon: string | null = licenses[0] || null;
    let maxCount = 0;
    for (const [license, count] of licenseFreq.entries()) {
        if (count > maxCount) {
            maxCount = count;
            mostCommon = license;
        }
    }
    
    return mostCommon ?? null;
}

/**
 * Infer dataset rights by aggregating or finding common rights information.
 */
export function inferDatasetRights(distributions: DistributionResultsFlat[]): string | null {
    if (distributions.length === 0) return null;
    
    const rights = distributions
        .map(d => d["distribution.rights"]?.value)
        .filter((r): r is string => typeof r === "string" && r.length > 0);
    
    if (rights.length === 0) return null;
    
    // Return the first unique rights statement
    return rights[0] ?? null;
}

/**
 * Infer dataset temporal coverage from distribution temporal data.
 */
export function inferDatasetTemporal(distributions: DistributionResultsFlat[]): { startDate?: string; endDate?: string } | null {
    if (distributions.length === 0) return null;
    
    const temporals = distributions
        .map(d => d["distribution.temporal"]?.value as any)
        .filter((t): t is { startDate?: string; endDate?: string } => 
            t && typeof t === "object" && (t.startDate || t.endDate)
        );
    
    if (temporals.length === 0) return null;
    
    const startDates = temporals
        .map(t => t.startDate)
        .filter((d): d is string => typeof d === "string")
        .sort();
    
    const endDates = temporals
        .map(t => t.endDate)
        .filter((d): d is string => typeof d === "string")
        .sort();
    
    const result: { startDate?: string; endDate?: string } = {};
    if (startDates.length > 0) result.startDate = startDates[0]; // earliest
    if (endDates.length > 0) result.endDate = endDates[endDates.length - 1]; // latest
    
    return Object.keys(result).length > 0 ? result : null;
}

/**
 * Infer dataset spatial coverage from distribution spatial data.
 */
export function inferDatasetSpatial(distributions: DistributionResultsFlat[]): { bbox?: string; centroid?: string } | null {
    if (distributions.length === 0) return null;
    
    const spatials = distributions
        .map(d => d["distribution.spatial"]?.value as any)
        .filter((s): s is { bbox?: string; centroid?: string } => 
            s && typeof s === "object" && (s.bbox || s.centroid)
        );
    
    if (spatials.length === 0) return null;
    
    // For now, return the first spatial info
    // In a real scenario, you might want to merge bboxes
    return spatials[0] ?? null;
}

/**
 * Infer dataset identifier from distribution URIs or first distribution filename.
 */
export function inferDatasetIdentifier(distributions: DistributionResultsFlat[]): string | null {
    if (distributions.length === 0) return null;
    
    // Try to extract from first distribution URI
    const firstDist = distributions[0];
    if (!firstDist) return null;
    const firstUri = firstDist["distribution.uri"]?.value;
    if (firstUri && typeof firstUri === "string") {
        // Extract filename or last path segment
        const match = firstUri.match(/([^/]+?)(?:\.\w+)?$/);
        if (match && match[1]) {
            return match[1].replace(/[-_]/g, " ").trim();
        }
    }
    
    return null;
}

/**
 * Infer dataset issued date from earliest distribution issued date.
 */
export function inferDatasetIssued(distributions: DistributionResultsFlat[]): string | null {
    if (distributions.length === 0) return null;
    
    const issuedDates = distributions
        .map(d => d["distribution.issued"]?.value)
        .filter((d): d is string => typeof d === "string")
        .sort();
    
    return issuedDates.length > 0 ? (issuedDates[0] ?? null) : null;
}

/**
 * Infer dataset modified date from latest distribution modified date.
 */
export function inferDatasetModified(distributions: DistributionResultsFlat[]): string | null {
    if (distributions.length === 0) return null;
    
    const modifiedDates = distributions
        .map(d => d["distribution.modified"]?.value)
        .filter((d): d is string => typeof d === "string")
        .sort();
    
    return modifiedDates.length > 0 ? (modifiedDates[modifiedDates.length - 1] ?? null) : null;
}

/**
 * Infer dataset languages from distribution languages.
 */
export function inferDatasetLanguage(distributions: DistributionResultsFlat[]): string[] | null {
    if (distributions.length === 0) return null;
    
    const languages = new Set<string>();
    
    for (const dist of distributions) {
        const lang = dist["distribution.language"]?.value;
        if (lang) {
            if (Array.isArray(lang)) {
                lang.forEach(l => languages.add(l));
            } else if (typeof lang === "string") {
                languages.add(lang);
            }
        }
    }
    
    return languages.size > 0 ? Array.from(languages) : null;
}

/**
 * Infer dataset conformsTo standards from distribution conformsTo.
 */
export function inferDatasetConformsTo(distributions: DistributionResultsFlat[]): string[] | null {
    if (distributions.length === 0) return null;
    
    const standards = new Set<string>();
    
    for (const dist of distributions) {
        const conformsTo = dist["distribution.conformsTo"]?.value;
        if (conformsTo) {
            if (Array.isArray(conformsTo)) {
                conformsTo.forEach(s => standards.add(s));
            } else if (typeof conformsTo === "string") {
                standards.add(conformsTo);
            }
        }
    }
    
    return standards.size > 0 ? Array.from(standards) : null;
}

/**
 * Infer dataset access rights from distribution rights information.
 */
export function inferDatasetAccessRights(distributions: DistributionResultsFlat[]): string | null {
    if (distributions.length === 0) return null;
    
    const accessRights = distributions
        .map(d => d["distribution.rights"]?.value)
        .filter((r): r is string => typeof r === "string" && r.length > 0);
    
    if (accessRights.length === 0) return null;
    
    // Return the first unique access rights statement
    return accessRights[0] ?? null;
}
