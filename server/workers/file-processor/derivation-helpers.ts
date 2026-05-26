import { CustomPropertyContext } from "~~/shared/types/schema.js";
import {
    ContextualKeyProcessInformation,
    DeterministicKeyProcessInformation,
    DerivationMap,
    ScoredValue,
    ContextualResults,
    DeterministicResults,
} from "~~/shared/types/workers.js";

export type ContextualDerivation = {
    key: string;
    info: ContextualKeyProcessInformation;
};

export type SourceInfo = { accessUrl?: string; downloadUrl?: string };

function splitPropertyKey(key: string): { context: CustomPropertyContext; prop: string } | null {
    if (!key.includes('.')) {
        return null;
    }
    const idx = key.indexOf('.');
    if (idx <= 0) return null;
    const context = key.slice(0, idx) as CustomPropertyContext;
    const prop = key.slice(idx + 1);
    if (!prop) return null;
    return { context, prop };
}

export function collectContextualDerivations(
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
            results.push({ key, info });
        }
    }
    return results;
}

export function collectDeterministicDerivations(
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
            results.push({ key, info });
        }
    }
    return results;
}

export function collectAllContextualDerivations(map: DerivationMap): ContextualDerivation[] {
    return Object.entries(map)
        .filter(([, info]) => info.strategy === "Contextual")
        .map(([key, info]) => ({
            key,
            info: info as ContextualKeyProcessInformation,
        }));
}

export function groupCustomProperties(customProperties: Array<{ context: CustomPropertyContext; iri: string }>): Record<CustomPropertyContext, string[]> {
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

export function collectDeterministicResults<TInput>(
    selected: Record<string, boolean>,
    context: CustomPropertyContext,
    map: DerivationMap,
    input: TInput
): DeterministicResults {
    const results: DeterministicResults = {};
    for (const [key, enabled] of Object.entries(selected)) {
        if (!enabled) continue;
        const split = splitPropertyKey(key);
        if (!split || split.context !== context) continue;
        const info = map[split.prop];
        if (info?.strategy !== "Deterministic") continue;

        try {
            const value = info.derivationFunction(input);
            results[key] = {
                value: value ?? null,
                confidence: value === null || value === undefined ? 0 : 1,
            };
        } catch {
            results[key] = {
                value: null,
                confidence: 0,
            };
        }
    }
    return results;
}

export function mergeScoredResults(base: ContextualResults, overlay: ContextualResults): ContextualResults {
    const merged: ContextualResults = { ...base };
    for (const [key, value] of Object.entries(overlay)) {
        const existing = merged[key];
        if (existing && existing.value !== null && existing.value !== undefined) {
            continue;
        }
        if (value && value.value !== null && value.value !== undefined) {
            merged[key] = value;
            continue;
        }
        if (!existing) {
            merged[key] = value;
        }
    }
    return merged;
}

export async function fetchRemoteText(url: string, maxChars = 5000): Promise<string | null> {
    try {
        const response = await fetch(url, {
            redirect: "follow",
            headers: {
                "User-Agent": "dcatextract",
                "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
            },
        });

        if (!response.ok) {
            return null;
        }

        const text = await response.text();
        if (!text) {
            return null;
        }

        const title = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim();
        const description = text
            .match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]
            ?.replace(/\s+/g, " ")
            .trim();
        const cleaned = text
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        return [
            title ? `Title: ${title}` : null,
            description ? `Description: ${description}` : null,
            cleaned.length > 0 ? cleaned : null,
        ].filter(Boolean).join("\n").slice(0, maxChars);
    } catch {
        return null;
    }
}

export function sourceUrlFromInfo(sourceInfo?: SourceInfo): string | null {
    return sourceInfo?.accessUrl ?? sourceInfo?.downloadUrl ?? null;
}