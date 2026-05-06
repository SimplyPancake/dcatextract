import OpenAI from "openai"
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";

const MODEL = "qwen/qwen3.5-9b"

let client: OpenAI | undefined

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

export async function queryModel<T extends z.ZodObject>(system: string, user: string, textformat: T): Promise<z.infer<T>> {
	const response = await getAI().responses.parse({
		model: MODEL,
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
}
