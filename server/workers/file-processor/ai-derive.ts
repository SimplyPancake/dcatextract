import { z } from "zod";
import { queryModel } from "../../utils/ai";
import { CustomPropertyContext } from "~~/shared/types/schema";
import { ContextualResults } from "~~/shared/types/workers";

const confidenceSchema = z.number().min(0).max(1);
const scored = <T extends z.ZodTypeAny>(schema: T) =>
    z.object({ value: schema.nullable(), confidence: confidenceSchema });

const baseSystemPrompt = `You are an expert data cataloger.
Analyze the provided file content or metadata and generate values only when they are clearly supported.
Return a confidence score per property indicating how directly the data supports the value.
If a value is not derivable, return null with low confidence.`;

type DerivationKey = {
    key: string;
    description?: string;
};

function buildPropertyHints(keys: DerivationKey[]): string {
    const lines: string[] = [];
    for (const item of keys) {
        if (!item.description) continue;
        lines.push(`- ${item.key}: ${item.description}`);
    }
    return lines.length ? `Property hints (for some properties):\n${lines.join("\n")}` : "";
}

export async function processProperties(
    contextType: CustomPropertyContext,
    keys: DerivationKey[],
    content: string
): Promise<ContextualResults> {
    const uniqueKeys = [...new Set(keys.map(item => item.key))];
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const key of uniqueKeys) {
        shape[key] = scored(z.string());
    }

    const schema = z.object(shape) as z.ZodType<ContextualResults>;
    const hints = buildPropertyHints(keys);
    const systemPrompt = `${baseSystemPrompt}
Context class: ${contextType}.`;

    return queryModel(
        systemPrompt,
        `${hints}\n\nContent:\n${content}`.trim(),
        schema
    );
}
