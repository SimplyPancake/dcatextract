import { z } from "zod";
import { queryModel } from "../../utils/ai";
import { CustomPropertyContext } from "~~/shared/types/schema";
import { ContextualResults } from "~~/shared/types/workers";

const confidenceSchema = z.number().min(0).max(1);
const scored = <T extends z.ZodTypeAny>(schema: T) =>
    z.object({ value: schema.nullable(), confidence: confidenceSchema });

const baseSystemPrompt = `You are an expert data cataloger.
Analyze the provided file content or metadata (which may be truncated) and generate values only when they are supported by the data.
Return a confidence score per property indicating how directly the data supports the value.
Use the full confidence range; do not habitually return 0 for uncertain-but-plausible answers.
FOCUS ON GIVING ANSWER WITH LOW CONFIDENCE RATHER THAN RETURNING NON-DERIVABLE.

Confidence rubric (guideline):
- 0.00: no evidence / no infer option
- 0.10: speculative.
- 0.40-0.70: partial but meaningful evidence.
- 0.80-1.00: direct, explicit evidence (e.g., text appears verbatim in content or metadata).

If you cannot derive a value, return null with a low zero confidence.
FOCUS ON GIVING ANSWER WITH LOW CONFIDENCE RATHER THAN RETURNING NON-DERIVABLE.

Heuristics:
- If the filename or extracted metadata (title/subject) contains text matching the description, treat that as direct evidence and set confidence >= 0.80.
- If the inspect/metadata shows a short description (e.g., PDF Subject, CSV header hints), prefer higher confidence.
- FOCUS ON GIVING ANSWER WITH LOW CONFIDENCE RATHER THAN RETURNING NON-DERIVABLE.

Provide answers in exact JSON matching the required keys.

Examples:
1) Content: "This dataset contains monthly rainfall measurements for 1990-2000."
    Output: { "distribution.description": { "value": "Monthly rainfall measurements for 1990-2000", "confidence": 0.9 } }

2) Content: "Random binary data with no textual cues"
    Output: { "distribution.description": { "value": "incoherent binary data", "confidence": 0.10 } }

FOCUS ON GIVING ANSWER WITH LOW CONFIDENCE RATHER THAN RETURNING NON-DERIVABLE.

Output format requirements:
- Each property key maps to an object with fields: { "value": <string|null>, "confidence": <number 0..1> }
- Confidence is required even when value is null.`;

type DerivationKey = {
    key: string;
    description?: string;
};

type PreparedDerivationKey = {
    outputKey: string;
    modelKey: string;
    description?: string;
};

function prepareDerivationKeys(
    contextType: CustomPropertyContext,
    keys: DerivationKey[]
): PreparedDerivationKey[] {
    const prefix = `${contextType}.`;
    const seenModelKeys = new Set<string>();
    const prepared: PreparedDerivationKey[] = [];

    for (const item of keys) {
        const modelKey = item.key.startsWith(prefix)
            ? item.key.slice(prefix.length)
            : item.key;

        if (seenModelKeys.has(modelKey)) {
            continue;
        }

        seenModelKeys.add(modelKey);
        prepared.push({
            outputKey: item.key,
            modelKey,
            description: item.description,
        });
    }

    return prepared;
}

function normalizeResults(
    keys: PreparedDerivationKey[],
    raw: Partial<ContextualResults>
): ContextualResults {
    const normalized: ContextualResults = {};
    for (const item of keys) {
        const candidate = raw[item.modelKey];
        if (
            candidate &&
            typeof candidate === "object" &&
            "confidence" in candidate &&
            "value" in candidate
        ) {
            normalized[item.outputKey] = candidate;
        } else {
            normalized[item.outputKey] = { value: null, confidence: 0 };
        }
    }
    return normalized;
}

function buildPropertyHints(keys: DerivationKey[]): string {
    const lines: string[] = [];
    function humanizeKey(key: string) {
        const local = key.split(/[.#/]/).pop() ?? key;
        return local.replace(/[-_.]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, c => c.toUpperCase()).trim();
    }
    for (const item of keys) {
        const label = humanizeKey(item.key);
        if (item.description) {
            lines.push(`- ${item.key} (${label}): ${item.description}`);
        } else {
            lines.push(`- ${item.key} (${label}): derive from the file content or metadata if directly supported.`);
        }
    }
    return lines.length ? `Property hints:\n${lines.join("\n")}` : "";
}

async function queryContextualResults(
    contextType: CustomPropertyContext,
    systemPrompt: string,
    userPrompt: string,
    flatSchema: z.ZodType<ContextualResults>
): Promise<Partial<ContextualResults>> {
    try {
        return await queryModel(systemPrompt, userPrompt, flatSchema);
    } catch (flatError) {
        const wrappedShape: Record<string, z.ZodTypeAny> = {
            [contextType]: flatSchema,
        };
        const wrappedSchema = z.object(wrappedShape) as z.ZodType<Record<string, ContextualResults>>;

        try {
            const wrapped = await queryModel(
                `${systemPrompt}\nIf you choose to wrap output, use exactly one top-level key named "${contextType}".`,
                userPrompt,
                wrappedSchema
            );

            return wrapped[contextType] ?? {};
        } catch {
            throw flatError;
        }
    }
}

export async function processProperties(
    contextType: CustomPropertyContext,
    keys: DerivationKey[],
    content: string,
    extraInstructions?: string,
    sourceName?: string,
    metadata?: string,
): Promise<ContextualResults> {
    const preparedKeys = prepareDerivationKeys(contextType, keys);
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const key of preparedKeys) {
        shape[key.modelKey] = scored(z.string());
    }

    const schema = z.object(shape) as z.ZodType<ContextualResults>;
    const hints = buildPropertyHints(
        preparedKeys.map((item) => ({ key: item.modelKey, description: item.description }))
    );
    let systemPrompt = `${baseSystemPrompt}
Context class: ${contextType}.`;

    if (sourceName) {
        systemPrompt += `\nSource file name: ${sourceName}.`;
    }

    if (extraInstructions) {
        systemPrompt += "\n" + extraInstructions
    }

    if (metadata) {
        systemPrompt += `
        User provided (compressed) metadata:
        ${metadata}`
    }

    const raw = await queryContextualResults(
        contextType,
        systemPrompt,
        `${hints}\n\nContent:\n${content}`.trim(),
        schema
    );

    return normalizeResults(preparedKeys, raw);
}

export async function processCompactProperties(
    contextType: CustomPropertyContext,
    keys: DerivationKey[],
    content: string,
    extraInstructions?: string,
    sourceName?: string
): Promise<ContextualResults> {
    const preparedKeys = prepareDerivationKeys(contextType, keys);
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const key of preparedKeys) {
        shape[key.modelKey] = scored(z.string());
    }

    const schema = z.object(shape) as z.ZodType<ContextualResults>;
    const hints = buildPropertyHints(
        preparedKeys.map((item) => ({ key: item.modelKey, description: item.description }))
    );
    let systemPrompt = `You are a concise data cataloger.
Return JSON only.
Use null when a value is not supported.
Use confidence in [0,1].
If evidence is direct, confidence should be high. If evidence is weak, use a low nonzero confidence.`;

    systemPrompt += `\nContext: ${contextType}.`;

    if (sourceName) {
        systemPrompt += `\nSource file name: ${sourceName}.`;
    }

    if (extraInstructions) {
        systemPrompt += "\n" + extraInstructions;
    }

    const raw = await queryContextualResults(
        contextType,
        systemPrompt,
        `${hints}\n\nContent:\n${content}`.trim(),
        schema
    );

    return normalizeResults(preparedKeys, raw);
}
