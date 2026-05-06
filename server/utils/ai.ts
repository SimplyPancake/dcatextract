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

		console.log("Client created!")
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

export async function queryModel<T extends z.ZodObject>(system: string, user: string, textformat: T): Promise<z.infer<T>> {
	try {
		const modelName = await selectBestModel()
		const response = await getAI().responses.parse({
			model: modelName,
			input: [
				{
					role: "system",
					content: system
				},
				{
					role: "user",
					content: user
				}
			],
			text: {
				format: zodTextFormat(textformat, "output_question")
			}
		})

		return response.output_parsed!
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error"
		const modelName = selectedModel ?? DEFAULT_MODEL
		const schemaKeys = getSchemaKeys(textformat).join(", ")
		const jsonOnlySystem = `${system}\n\nReturn only valid JSON. Required keys: ${schemaKeys}. No extra keys.`

		try {
			const response = await getAI().responses.create({
				model: modelName,
				input: [
					{
						role: "system",
						content: jsonOnlySystem
					},
					{
						role: "user",
						content: user
					}
				]
			})

			const outputText = (response as any).output_text ?? ""
			const jsonText = extractFirstJsonObject(outputText)
			if (jsonText) {
				const parsed = textformat.safeParse(JSON.parse(jsonText))
				if (parsed.success) return parsed.data
			}
		} catch (fallbackError) {
			const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "Unknown error"
			throw new Error(`AI query failed for model ${modelName}: ${message}; fallback error: ${fallbackMessage}`)
		}

		throw new Error(`AI query failed for model ${modelName}: ${message}`)
	}
}
