import { z } from 'zod'
import { DataProvider, datasetProviders } from '~~/shared/types/url'

const bodySchema = z.object({
	url: z.httpUrl()
})

export default defineEventHandler(async (event) => {
	const result = await readValidatedBody(event, body => bodySchema.safeParse(body))

	if (!result.success) {
		throw createError({
			statusCode: 400,
			statusMessage: 'Invalid URL',
			message: 'Please provide a valid, absolute URL.'
		})
	}

	const { url } = result.data
	const hostname = new URL(url).hostname.toLowerCase()

	const provider = getProviderFromHostname(hostname)
	if (provider == 'Unknown') {
		throw createError({
			statusCode: 400,
			statusMessage: 'Unknown provider',
			message: `No supported provider found for URL: ${url}`
		})
	}

	const identifier = getIdentifier(url, provider)

	if (identifier == '') {
		throw createError({
			statusCode: 422,
			statusMessage: 'Could not get identifier from URL',
			message: `Could not extract information from provider URL. Try a different URL (structure): ${url}`
		})
	}

	return {
		sourceType: provider,
		identifier
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

function getIdentifier(url: string, provider: DataProvider): string {
	if (provider == 'Unknown' || provider == 'CKAN') {
		return ''
	}

	const providerConfig = datasetProviders.find(p => p.provider == provider)
	if (!providerConfig) {
		return ''
	}

	const match = url.match(providerConfig.identifierRegex)
	
	if (!match) {
		return ''
	}
	return `${match[1]!}/${match[2]!}`;
}