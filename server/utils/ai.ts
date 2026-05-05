import { LMStudioClient } from "@lmstudio/sdk";

let client: LMStudioClient | undefined

export function getAI(): LMStudioClient {
	if (!client) {
		const config = useRuntimeConfig()
		client = new LMStudioClient({
			clientIdentifier: config.llmToken,
			baseUrl: config.llmUrl
		})

		console.log("Client created!")
		client.llm.listLoaded().then(x => console.log(x))
	}
	return client
}
