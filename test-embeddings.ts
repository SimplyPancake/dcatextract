import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: process.env.NUXT_LLM_URL,
  apiKey: process.env.NUXT_LLM_TOKEN,
})

const ORIGINAL = "Encrypted HTTPS traffic classification dataset with 145,671 network flows, 88 numerical features, and six categorical labels (e.g., Download, Live Video) for deep learning and ensemble analysis"

const toTest = "Classify web activities using network traffic data"

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0)
  const magA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0))
  const magB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0))
  if (magA === 0 || magB === 0) return 0
  return dot / (magA * magB)
}

async function embed(input: string): Promise<number[]> {
  const res = await client.embeddings.create({
    model: 'text-embedding-mxbai-embed-large-v1', 
    input,
    encoding_format: 'base64'
})
  return res.data[0].embedding
}

const [originalEmbedding, testEmbedding] = await Promise.all([
  embed(ORIGINAL),
  embed(toTest),
])

const similarity = cosineSimilarity(originalEmbedding, testEmbedding)
console.log(`Cosine similarity: ${similarity.toFixed(4)}`)