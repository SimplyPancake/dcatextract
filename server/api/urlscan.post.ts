import { z } from 'zod'
import { DataProvider } from '~~/shared/types/url'

const bodySchema = z.object({
	url: z.string().url()
})

export default defineEventHandler(async (event) => {
	const result = await readValidatedBody(event, body => bodySchema.safeParse(body))

	if (!result.success) {
		throw result.error.issues
	}

	const { url } = result.data
	const hostname = new URL(url).hostname.toLowerCase()

	const provider = getProviderFromHostname(hostname)

	return {
		sourceType: provider
	} as URLScanResult
})

function getProviderFromHostname(hostname: string): DataProvider {
	if (hostname === 'kaggle.com' || hostname.endsWith('.kaggle.com')) return 'Kaggle'
	if (hostname === 'huggingface.co' || hostname.endsWith('.huggingface.co')) return 'HuggingFace'
	if (hostname === 'github.com' || hostname.endsWith('.github.com') || hostname === 'raw.githubusercontent.com') {
		return 'GitHub'
	}
	return 'Unknown'
}