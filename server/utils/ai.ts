import OpenAI from 'openai';

let client: OpenAI | undefined

export function getAI(): OpenAI {
	if (!client) {
		// @ts-ignore - useRuntimeConfig is available in Nitro context
		const config = useRuntimeConfig()
		client = new OpenAI({
			apiKey: config.llmToken,
			baseURL: config.llmUrl
		})

		console.log("Client created!")
		client.models.list().then(x => console.log(x))
	}
	return client
}
