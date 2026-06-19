import OpenAI from "openai"
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";

const config = useRuntimeConfig()
const DEFAULT_MODEL = config.preferredModel

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

function scoreModelId(modelId: string, preferredModelName?: string): number {
	const id = modelId.toLowerCase()
	let score = 0

	if (preferredModelName && id == preferredModelName) {
		return 99
	}

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

async function selectBestModel(preferredModelName?: string): Promise<string> {
	const ai = getAI()
	try {
		const list = await ai.models.list()
		const models = list?.data ?? []

		if (models.map(x => x.id).includes(DEFAULT_MODEL)) {
			return DEFAULT_MODEL
		}

		if (!modelsLogged) {
			modelsLogged = true
			for (const model of models) {
				const created = typeof model.created === "number" ? new Date(model.created * 1000).toISOString() : "unknown"
				// console.log(`Model available: ${model.id} (owned_by=${model.owned_by ?? "unknown"}, created=${created})`)
			}
		}

		if (models.length > 0) {
			const sorted = [...models].sort((a, b) => scoreModelId(b.id, preferredModelName) - scoreModelId(a.id, preferredModelName))
			selectedModel = sorted[0]?.id ?? DEFAULT_MODEL
			console.log("Selected model:", selectedModel)
			return selectedModel
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error"
		console.warn(`Failed to list models, falling back to default: ${message}`)
	}

	selectedModel = preferredModelName ?? DEFAULT_MODEL
	console.log("Selected model:", selectedModel)
	return selectedModel
}

export async function queryModelNoSchema(
	system: string,
	user: string,
	preferredModelName?: string,
) {
	const modelName = await selectBestModel(preferredModelName)
	let systemPrompt = system

	const maxRetries = 3
	let lastError: unknown

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			const response = await getAI().responses.create({
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
			})

			if (response.error) {
				throw new Error("Model returned error")
			}

			return response.output_text
		} catch (error) {
			lastError = error
			const errorMsg = error instanceof Error ? error.message : String(error)

			if (attempt < maxRetries) {
				console.warn(
					`Retry ${attempt}/${maxRetries} failed for model ${modelName}: ${errorMsg}`
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

export async function queryModel<T extends z.ZodTypeAny>(
	system: string,
	user: string,
	schema: T,
	useJSONOutput = true,
	preferredModelName?: string,
): Promise<z.infer<T>> {
	const modelName = await selectBestModel(preferredModelName)

	const schemaKeys =
		schema instanceof z.ZodObject
			? Object.keys(schema.shape).join(", ")
			: "unknown"


	let systemPrompt = system
	if (useJSONOutput) {
		
		systemPrompt += `

You MUST respond with ONLY a valid JSON object, nothing else.
IF ASKED FOR DESCRIPTION, YOU MUST GIVE A DESCRIPTION.
JSON Rules:
- Begin with { and end with }
- Include all required fields: ${schemaKeys}
- No extra fields
- No markdown, backticks, or formatting
- No text before or after JSON
- Ensure all values are properly escaped
- Double-check the JSON is valid before responding
- DO NOT RETURN UNDEFINED VALUES. RATHER EMPTY STRING.
- ALWAYS RETURN STRING TYPE.
		`
	}

	const maxRetries = 3
	let lastError: unknown

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			console.debug(`[queryModel] Attempt ${attempt}/${maxRetries} for schema keys: ${schemaKeys}`)
			
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

			console.debug(`[queryModel] Response received, output_parsed:`, JSON.stringify(response.output_parsed).slice(0, 200))

			if (!response.output_parsed) {
				throw new Error("Model returned empty parsed output")
			}

			return response.output_parsed
		} catch (error) {
			lastError = error
			const errorMsg = error instanceof Error ? error.message : String(error)
			
			console.debug(`[queryModel] Error on attempt ${attempt}:`, errorMsg)
			if (error instanceof Error && 'cause' in error) {
				console.debug(`[queryModel] Error cause:`, error.cause)
			}

			if (attempt < maxRetries) {
				console.warn(
					`Retry ${attempt}/${maxRetries} failed for model ${modelName}: ${errorMsg}`
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