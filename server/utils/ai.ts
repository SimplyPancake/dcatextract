import OpenAI from "openai"
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";

const DEFAULT_MODEL = "qwen/qwen3.5-9b"

let client: OpenAI | undefined
let selectedModel: string | undefined
let modelsLogged = false

export function getAI(): OpenAI {
	if (!client) {
		const config = useRuntimeConfig()
		client = new OpenAI({
			apiKey: config.llmToken,
			baseURL: config.llmUrl
		})
	}
	return client
}

function scoreModelId(modelId: string): number {
	const id = modelId.toLowerCase()
	let score = 0

	if (id.includes("deepseek")) score += 6
	if (id.includes("qwen")) score += 5
	if (id.includes("instruct") || id.includes("chat")) score += 3
	if (id.includes("text")) score += 1

	// const sizeMatch = id.match(/(\d+(?:\.\d+)?)\s*b/)
	// if (sizeMatch) {
	// 	const size = Number(sizeMatch[1])
	// 	if (!Number.isNaN(size)) score += size
	// }

	return score
}

function getSchemaKeys(schema: z.ZodObject<any>): string[] {
	return Object.keys(schema.shape)
}

function extractFirstJsonObject(text: string): string | null {
	const start = text.indexOf("{")
	if (start === -1) return null

	let depth = 0
	for (let i = start; i < text.length; i += 1) {
		const char = text[i]
		if (char === "{") depth += 1
		if (char === "}") depth -= 1
		if (depth === 0) return text.slice(start, i + 1)
	}

	return null
}

async function selectBestModel(): Promise<string> {
	if (selectedModel) return selectedModel

	const ai = getAI()
	try {
		const list = await ai.models.list()
		const models = list?.data ?? []

		if (!modelsLogged) {
			modelsLogged = true
			for (const model of models) {
				const created = typeof model.created === "number" ? new Date(model.created * 1000).toISOString() : "unknown"
				// console.log(`Model available: ${model.id} (owned_by=${model.owned_by ?? "unknown"}, created=${created})`)
			}
		}

		if (models.length > 0) {
			const sorted = [...models].sort((a, b) => scoreModelId(b.id) - scoreModelId(a.id))
			selectedModel = sorted[0]?.id ?? DEFAULT_MODEL
			console.log("Selected model:", selectedModel)
			return selectedModel
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error"
		console.warn(`Failed to list models, falling back to default: ${message}`)
	}

	selectedModel = DEFAULT_MODEL
	console.log("Selected model:", selectedModel)
	return selectedModel
}

export async function queryModel<T extends z.ZodTypeAny>(
	system: string,
	user: string,
	schema: T
): Promise<z.infer<T>> {
	const modelName = await selectBestModel()

	const schemaKeys =
		schema instanceof z.ZodObject
			? Object.keys(schema.shape).join(", ")
			: "unknown"

	const systemPrompt = `
${system}

You are also a JSON generation engine.

STRICT RULES:
- Return ONLY valid JSON
- No markdown
- Do NOT begin output with backticks
- No explanations
- No text before or after JSON
- Do not use code blocks.
- Do not wrap output in \`\`\` or any formatting.
- Output must start with { and end with }.
- All required fields must exist
- No extra keys
- Required keys: ${schemaKeys}
- Return ONLY valid JSON
`

	const maxRetries = 3
	let lastError: unknown

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			const response = await getAI().responses.parse({
				model: modelName,
				input: [
					{
						role: "system",
						content: systemPrompt
					},
					{
						role: "user",
						content: user
					}
				],
				text: {
					format: zodTextFormat(schema, "output")
				},
				temperature: 0
			})

			if (!response.output_parsed) {
				throw new Error("Model returned empty parsed output")
			}

			return response.output_parsed
		} catch (error) {
			lastError = error

			// Retry hint
			if (attempt < maxRetries) {
				console.warn(
					`Retry ${attempt}/${maxRetries} failed for model ${modelName}`
				)
			}
		}
	}

	const message =
		lastError instanceof Error
			? lastError.message
			: "Unknown error"

	throw new Error(
		`AI query failed after ${maxRetries} attempts for model ${modelName}: ${message}`
	)
}