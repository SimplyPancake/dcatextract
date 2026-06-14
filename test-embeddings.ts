import { randomUUID } from 'crypto'
import OpenAI from 'openai'
import fs from 'fs/promises'
import path from 'path'

const API_BASE = process.env.API_BASE || 'http://localhost:3000'

const client = new OpenAI({
  baseURL: process.env.NUXT_LLM_URL,
  apiKey: process.env.NUXT_LLM_TOKEN,
})

// Helper function to extract kaggleId from Kaggle URL
function extractKaggleId(url: string): string {
  const match = url.match(/\/datasets\/(.+)$/)
  if (!match) {
    throw new Error(`Invalid Kaggle URL format: ${url}`)
  }
  return match[1]
}

// Test datasets configuration
interface TestDataset {
  name: string
  kaggleUrl: string
  publicationUrl?: string
  publicationPdfPath?: string  // Local path to publication PDF for testing
  groundTruth?: {
    description?: string
    keywords?: string[]
  },
  processed?: boolean
}

const TEST_DATASETS: TestDataset[] = [
  {
    name: 'Credit card fraud',
    kaggleUrl: 'https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud',
    publicationUrl: 'https://arxiv.org/pdf/1904.10604',
    publicationPdfPath: './publications/creditcard.pdf',
    groundTruth: {
      description: 'Archive containing all the contents of the Credit Card Fraud Detection dataset',
      keywords: ['finance', 'government', 'crime']
    },
    processed: true
  },
  {
    name: 'MedCost',
    kaggleUrl: 'https://www.kaggle.com/datasets/mirichoi0218/insurance',
    publicationUrl: 'https://arxiv.org/pdf/2304.12605',
    publicationPdfPath: './publications/medcost.pdf',
    groundTruth: {
      description: 'Medical Cost Personal Datasets Insurance Forecast by using Linear Regression',
      keywords: ['healthcare', 'finance', 'insurance', 'education', 'health']
    },
    processed: true,
  },
  { // This has bad metadata on Kaggle
    name: 'AES-data',
    kaggleUrl: 'https://www.kaggle.com/datasets/jaytonde/aes-dataset',
    publicationUrl: 'https://arxiv.org/pdf/1909.09482',
    publicationPdfPath: './publications/automatedessay.pdf',
    groundTruth: {
      description: 'Archive containing all the contents of the AES-DATASET dataset',
      keywords: [] // Has no keywords
    },
    processed: true,
  },
  {
    name: 'NoShows',
    kaggleUrl: 'https://www.kaggle.com/datasets/joniarroba/noshowappointments',
    publicationUrl: 'https://arxiv.org/pdf/2010.00509',
    publicationPdfPath: './publications/noShows.pdf',
    groundTruth: {
      description: '10.527 medical appointments its 14 associated variables (characteristics). The most important one if the patient show-up or no-show to the appointment.',
      keywords: ['health', 'public health', 'healthcare']
    },
    processed: true
  }
]

// Schema keys to process: dataset description and keywords
const SCHEMA_KEYS = {
  "dataset.versionNotes": true,
  "dataset.hasCurrentVersion": true,
  "dataset.hasVersion": true,
  "dataset.previousVersion": true,
  "dataset.version": true,
  "dataset.creator": true,
  "dataset.description": true,
  "distribution.description": true,
  "dataService.description": true,
  "catalogRecord.description": true,
  "dataset.license": true,
  "distribution.license": true,
  "dataset.modified": true,
  "distribution.modified": true,
  "catalogRecord.modified": true,
  "dataset.publisher": true,
  "dataset.title": true,
  "distribution.title": true,
  "dataService.title": true,
  "catalogRecord.title": true,
  "distribution.accessService": true,
  "distribution.accessURL": true,
  "distribution.byteSize": true,
  "dataset.catalog": true,
  "dataService.catalog": true,
  "distribution.compressFormat": true,
  "dataset.contactPoint": true,
  "dataset.dataset": true,
  "dataService.dataset": true,
  "dataset.distribution": true,
  "dataService.distribution": true,
  "distribution.downloadURL": true,
  "dataset.endpointDescription": true,
  "dataService.endpointDescription": true,
  "dataset.endpointURL": true,
  "dataService.endpointURL": true,
  "dataset.first": true,
  "dataset.inSeries": true,
  "dataset.keyword": true,
  "dataset.landingPage": true,
  "dataset.last": true,
  "distribution.mediaType": true,
  "distribution.packageFormat": true,
  "dataset.prev": true,
  "dataset.qualifiedRelation": true,
  "dataService.qualifiedRelation": true,
  "dataset.record": true,
  "dataService.record": true,
  "dataset.resource": true,
  "dataService.resource": true,
  "dataset.servesDataset": true,
  "dataService.servesDataset": true,
  "dataset.service": true,
  "dataService.service": true,
  "dataset.spatialResolutionInMeters": true,
  "distribution.spatialResolutionInMeters": true,
  "dataset.temporalResolution": true,
  "distribution.temporalResolution": true,
  "dataset.theme": true,
  "dataset.themeTaxonomy": true,
  "dataService.themeTaxonomy": true,
  "dataset.uri": true,
  "distribution.uri": true,
  "catalogRecord.uri": true,
  "distribution.issued": true,
  "distribution.rights": true,
  "distribution.conformsTo": true,
  "distribution.language": true,
  "distribution.format": true,
  "distribution.spatial": true,
  "distribution.temporal": true,
  "dataset.identifier": true,
  "dataset.issued": true,
  "dataset.language": true,
  "dataset.wasAttributedTo": true,
  "dataset.rightsHolder": true,
  "dataset.rights": true,
  "dataset.accessRights": true,
  "dataset.conformsTo": true,
  "dataset.type": true,
  "dataset.isVersionOf": true,
  "dataset.nextVersion": true,
  "dataset.qualifiedAttribution": true,
  "dataset.inCatalog": true,
  "dataset.spatial": true,
  "dataset.temporal": true,
  "dataset.accrualPeriodicity": true,
  "dataset.next": true,
  "catalogRecord.primaryTopic": true,
  "catalogRecord.issued": true,
  "catalogRecord.language": true,
  "catalogRecord.conformsTo": true,
  "catalogRecord.status": true,
  "catalogRecord.source": true
}

const INFERENCE_PERCENTAGE = 60

interface TestResult {
  datasetName: string
  withoutMetadata: {
    sessionId: string
    extractedDescription?: string
    extractedKeywords?: string | string[]
    descriptionSimilarity?: number
    keywordsSimilarity?: number
  }
  withMetadata: {
    sessionId: string
    extractedDescription?: string
    extractedKeywords?: string | string[]
    descriptionSimilarity?: number
    keywordsSimilarity?: number
  }
  comparison: {
    descriptionSimilarityDelta?: number
    keywordsSimilarityDelta?: number
    descriptionFeatureSimilarity?: number
    keywordsFeatureSimilarity?: number
  }
  status: 'success' | 'failed'
  error?: string
  duration: number
}


interface DownloadStatusResponse {
  job?: any
  status?: string | null
  errorMessage?: string | null
}

interface ProcessStatusResponse {
  id?: string
  state?: string
  progress?: number | { progress: number; message: string }
  data?: any
  returnvalue?: any
}

async function createSession(): Promise<string> {
  return randomUUID()
}

async function startDownload(sessionId: string, url: string, provider: string, identifier: string) {
  console.log(`[${sessionId}] Starting download from ${provider}...`)
  
  const response = await fetch(`${API_BASE}/api/job/download/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `sessionId=${sessionId}`
    },
    body: JSON.stringify({
      url,
      provider,
      identifier
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Download start failed: ${response.statusText} - ${errorText}`)
  }

  const data = await response.json() as { jobId: string }
  console.log(`[${sessionId}] Download job created: ${data.jobId}`)
  return data.jobId
}

async function waitForDownloadCompletion(sessionId: string, maxWaitSeconds: number = 300): Promise<void> {
  const startTime = Date.now()
  const maxWaitMs = maxWaitSeconds * 1000

  while (Date.now() - startTime < maxWaitMs) {
    const response = await fetch(`${API_BASE}/api/job/download/status`, {
      headers: {
        'Cookie': `sessionId=${sessionId}`
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to check download status: ${response.statusText}`)
    }

    const text = await response.text()
    if (!text) {
      throw new Error('Download status endpoint returned empty response')
    }

    const data = JSON.parse(text) as DownloadStatusResponse

    if (data.status === 'completed') {
      return
    }

    if (data.status === 'failed') {
      throw new Error(`Download failed: ${data.errorMessage || 'Unknown error'}`)
    }

    // If there's a job object with progress
    if (data.job?.progress !== undefined) {
      const progress = typeof data.job.progress === 'number' ? data.job.progress : data.job.progress?.progress
      const message = typeof data.job.progress === 'object' ? data.job.progress?.message : ''
      console.log(`[${sessionId}] Download progress: ${progress}% - ${message || ''}`)
    }

    // Wait 5 seconds before polling again
    await new Promise(resolve => setTimeout(resolve, 5000))
  }

  throw new Error(`Download did not complete within ${maxWaitSeconds} seconds`)
}

async function getDownloadJobResults(sessionId: string) {
  console.log(`[${sessionId}] Fetching download job results...`)

  const response = await fetch(`${API_BASE}/api/job/download/latest-completed`, {
    headers: {
      'Cookie': `sessionId=${sessionId}`
    }
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch download results: ${response.statusText}`)
  }

  const text = await response.text()
  if (!text) {
    throw new Error('Download results endpoint returned empty response')
  }

  const job = JSON.parse(text)
  const downloadResults = job?.returnvalue
  
  console.log(`[${sessionId}] DEBUG getDownloadJobResults - job keys:`, Object.keys(job || {}))
  console.log(`[${sessionId}] DEBUG getDownloadJobResults - returnvalue:`, downloadResults)
  
  return downloadResults
}


async function startProcessing(
  sessionId: string,
  schemas: Record<string, boolean>,
  inferencePercentage: number
) {
  console.log(`[${sessionId}] Starting file processing...`)
  
  const body = {
    schemas,
    customProperties: [],
    inferencePercentage
  }
  // console.log(`[${sessionId}] DEBUG startProcessing - sending body:`, JSON.stringify(body))

  const response = await fetch(`${API_BASE}/api/job/process/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `sessionId=${sessionId}`
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Process start failed: ${response.statusText} - ${errText}`)
  }

  const data = await response.json() as { message: string }
  console.log(`[${sessionId}] ${data.message}`)
}

async function waitForProcessingCompletion(sessionId: string, maxWaitSeconds: number = 600): Promise<void> {
  console.log('Waiting for process to finish...')
  const startTime = Date.now()
  const maxWaitMs = maxWaitSeconds * 1000
  let checkCount = 0

  while (Date.now() - startTime < maxWaitMs) {
    checkCount++
    const response = await fetch(`${API_BASE}/api/job/process/status`, {
      headers: {
        'Cookie': `sessionId=${sessionId}`
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to check process status: ${response.statusText}`)
    }

    const text = await response.text()
    if (!text) {
      // Empty response means no active job - it's done
      return
    }

    const data = JSON.parse(text)
    // console.log(`[${sessionId}] Process status check #${checkCount}:`, data.state || 'unknown')

    // If response is an empty object, no job running
    if (typeof data === 'object' && data !== null && Object.keys(data).length === 0) {
      return
    }

    // If we got here and it's null/falsy, job is done
    if (!data) {
      return
    }

    // Check for progress in the job object
    if (data.progress !== undefined) {
      const progress = typeof data.progress === 'number' ? data.progress : data.progress?.progress
      const message = typeof data.progress === 'object' ? data.progress?.message : ''
      // console.log(`[${sessionId}] Processing progress: ${progress}% - ${message || ''}`)
    }

    // Wait 5 seconds before polling again
    await new Promise(resolve => setTimeout(resolve, 5000))
  }

  throw new Error(`Processing did not complete within ${maxWaitSeconds} seconds`)
}

async function getLatestJobResults(sessionId: string) {
  console.log(`[${sessionId}] Fetching latest job results...`)

  const response = await fetch(`${API_BASE}/api/job/process/latest-completed`, {
    headers: {
      'Cookie': `sessionId=${sessionId}`
    }
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch results: ${response.statusText}`)
  }

  const text = await response.text()
  if (!text) {
    throw new Error('Results endpoint returned empty response')
  }

  const job = JSON.parse(text)
  
  // Access the returnvalue from the Job object (same pattern as DataOverviewStep.vue)
  const results = job?.returnvalue
  
  if (!results) {
    throw new Error(`No results in job returnvalue`)
  }
  
  return results
}

// ─── Embedding utilities ──────────────────────────────────────────────────────

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

// Helper function to check if file exists
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function uploadMetadata(sessionId: string, filePath: string): Promise<void> {
  console.log(`[${sessionId}] Uploading metadata file: ${filePath}`)

  const form = new FormData()
  const fileContent = await fs.readFile(filePath)
  const blob = new Blob([fileContent], { type: 'application/pdf' })
  form.append('metadataFiles', blob, path.basename(filePath))

  const response = await fetch(`${API_BASE}/api/metadata`, {
    method: 'POST',
    headers: {
      'Cookie': `sessionId=${sessionId}`
    },
    body: form
  })

  if (!response.ok) {
    throw new Error(`Metadata upload failed: ${response.statusText}`)
  }

  console.log(`[${sessionId}] Metadata uploaded successfully`)
}

async function main() {
  const results: TestResult[] = []
  console.log(`\n${'='.repeat(100)}`)
  console.log('Dataset Extraction Test Runner (With & Without Additional Metadata)')
  console.log(`${'='.repeat(100)}\n`)

  const unDoneDatasets = TEST_DATASETS.filter(x => !x.processed)
  for (let i = 0; i < unDoneDatasets.length; i++) {
    const dataset = unDoneDatasets[i]
    const startTime = Date.now()
    
    console.log(`\n[${'█'.repeat(i + 1)}${'░'.repeat(unDoneDatasets.length - i - 1)}] Testing ${i + 1}/${unDoneDatasets.length}: ${dataset.name}`)
    console.log('─'.repeat(100))

    try {
      // ─── Test WITHOUT metadata ───────────────────────────────────────────────
      console.log('\n📝 Phase 1: Testing WITHOUT additional metadata')
      const sessionId1 = await createSession()
      console.log(`   Session: ${sessionId1}`)

      await startDownload(sessionId1, dataset.kaggleUrl, 'Kaggle', extractKaggleId(dataset.kaggleUrl))
      await waitForDownloadCompletion(sessionId1)
      
      // DEBUG: verify download created files
      console.log(`   📋 DEBUG Phase1 - sessionId: ${sessionId1}`)
      try {
        const dlResults1 = await getDownloadJobResults(sessionId1)
        // console.log(`   📋 DEBUG Phase1 - download results:`, dlResults1)
      } catch (e) {
        console.log(`   📋 DEBUG Phase1 - error fetching download results:`, e instanceof Error ? e.message : e)
      }
      
      console.log(`   📋 DEBUG Phase1 - about to call startProcessing with:`, {sessionId: sessionId1, schemas: Object.keys(SCHEMA_KEYS), inferencePercentage: INFERENCE_PERCENTAGE})
      await startProcessing(sessionId1, SCHEMA_KEYS, INFERENCE_PERCENTAGE)
      // Give the queue a moment to pick up the job
      await new Promise(resolve => setTimeout(resolve, 1000))
      await waitForProcessingCompletion(sessionId1)

      const jobResults1 = await getLatestJobResults(sessionId1)
      
      // Debug: trace extraction step by step
      // console.log(`   📋 DEBUG Step 1 - Full jobResults1:`, JSON.stringify(jobResults1, null, 2).substring(0, 500))
      console.log(`   📋 DEBUG Step 2 - jobResults1.dataset exists?:`, !!jobResults1?.dataset)
      if (jobResults1?.dataset) {
        console.log(`   📋 DEBUG Step 3 - dataset keys:`, Object.keys(jobResults1.dataset))
        console.log(`   📋 DEBUG Step 4 - dataset.description:`, JSON.stringify(jobResults1.dataset['dataset.description']))
        console.log(`   📋 DEBUG Step 5 - dataset.description.result:`, JSON.stringify(jobResults1.dataset['dataset.description']?.result))
        console.log(`   📋 DEBUG Step 6 - dataset.description.result.value:`, jobResults1.dataset['dataset.description']?.result?.value)
      }
      
      const extractedDescription1 = jobResults1?.dataset?.['dataset.description']?.result?.value
      const extractedKeywords1 = jobResults1?.dataset?.['dataset.theme']?.result?.value

      let descriptionSimilarity1: number | undefined
      let keywordsSimilarity1: number | undefined

      if (extractedDescription1 && dataset.groundTruth?.description) {
        const descEmbeddings = await Promise.all([
          embed(typeof extractedDescription1 === 'string' ? extractedDescription1 : String(extractedDescription1)),
          embed(dataset.groundTruth.description)
        ])
        descriptionSimilarity1 = cosineSimilarity(descEmbeddings[0], descEmbeddings[1])
      }

      if (extractedKeywords1 && dataset.groundTruth?.keywords) {
        const keywordsStr = Array.isArray(extractedKeywords1) ? extractedKeywords1.join(', ') : String(extractedKeywords1)
        const keywordsEmbeddings = await Promise.all([
          embed(keywordsStr),
          embed(dataset.groundTruth.keywords.join(', '))
        ])
        keywordsSimilarity1 = cosineSimilarity(keywordsEmbeddings[0], keywordsEmbeddings[1])
      }

      console.log(`   ✅ Without metadata: desc_sim=${descriptionSimilarity1?.toFixed(4) || 'N/A'}, kw_sim=${keywordsSimilarity1?.toFixed(4) || 'N/A'}`)

      // ─── Test WITH metadata ─────────────────────────────────────────────────
      console.log('\n📝 Phase 2: Testing WITH additional metadata')
      const sessionId2 = await createSession()
      console.log(`   Session: ${sessionId2}`)

      await startDownload(sessionId2, dataset.kaggleUrl, 'Kaggle', extractKaggleId(dataset.kaggleUrl))
      await waitForDownloadCompletion(sessionId2)
      
      // DEBUG: verify download created files before upload
      console.log(`   📋 DEBUG Phase2 - sessionId: ${sessionId2}`)
      try {
        const dlResults2 = await getDownloadJobResults(sessionId2)
        console.log(`   📋 DEBUG Phase2 - download results BEFORE upload:`, dlResults2)
      } catch (e) {
        console.log(`   📋 DEBUG Phase2 - error fetching download results:`, e instanceof Error ? e.message : e)
      }

      // Upload metadata if file path is provided and exists
      if (dataset.publicationPdfPath) {
        const exists = await fileExists(dataset.publicationPdfPath)
        if (exists) {
          try {
            console.log(`   📋 DEBUG Phase2 - uploading metadata...`)
            await uploadMetadata(sessionId2, dataset.publicationPdfPath)
            console.log(`   📋 DEBUG Phase2 - metadata uploaded`)
          } catch (err) {
            console.log(`   ⚠️  Could not upload metadata: ${err instanceof Error ? err.message : err}`)
          }
        } else {
          console.log(`   ⚠️  Metadata file not found: ${dataset.publicationPdfPath}`)
        }
      }

      // DEBUG: verify download results after upload (files should still be there)
      try {
        const dlResults2After = await getDownloadJobResults(sessionId2)
        console.log(`   📋 DEBUG Phase2 - download results AFTER upload:`, dlResults2After)
      } catch (e) {
        console.log(`   📋 DEBUG Phase2 - error fetching download results after upload:`, e instanceof Error ? e.message : e)
      }
      
      // console.log(`   📋 DEBUG Phase2 - about to call startProcessing with:`, {sessionId: sessionId2, schemas: Object.keys(SCHEMA_KEYS), inferencePercentage: INFERENCE_PERCENTAGE})
      await startProcessing(sessionId2, SCHEMA_KEYS, INFERENCE_PERCENTAGE)
      // Give the queue a moment to pick up the job
      await new Promise(resolve => setTimeout(resolve, 1000))
      await waitForProcessingCompletion(sessionId2)

      const jobResults2 = await getLatestJobResults(sessionId2)
      
      // Debug: trace extraction step by step
      // console.log(`   📋 DEBUG Step 1 - Full jobResults2:`, JSON.stringify(jobResults2, null, 2).substring(0, 500))
      console.log(`   📋 DEBUG Step 2 - jobResults2.dataset exists?:`, !!jobResults2?.dataset)
      if (jobResults2?.dataset) {
        console.log(`   📋 DEBUG Step 3 - dataset keys:`, Object.keys(jobResults2.dataset))
        console.log(`   📋 DEBUG Step 4 - dataset.description:`, JSON.stringify(jobResults2.dataset['dataset.description']))
        console.log(`   📋 DEBUG Step 5 - dataset.description.result:`, JSON.stringify(jobResults2.dataset['dataset.description']?.result))
        console.log(`   📋 DEBUG Step 6 - dataset.description.result.value:`, jobResults2.dataset['dataset.description']?.result?.value)
      }
      
      const extractedDescription2 = jobResults2?.dataset?.['dataset.description']?.result?.value
      const extractedKeywords2 = jobResults2?.dataset?.['dataset.theme']?.result?.value

      let descriptionSimilarity2: number | undefined
      let keywordsSimilarity2: number | undefined

      if (extractedDescription2 && dataset.groundTruth?.description) {
        const descEmbeddings = await Promise.all([
          embed(typeof extractedDescription2 === 'string' ? extractedDescription2 : String(extractedDescription2)),
          embed(dataset.groundTruth.description)
        ])
        descriptionSimilarity2 = cosineSimilarity(descEmbeddings[0], descEmbeddings[1])
      }

      if (extractedKeywords2 && dataset.groundTruth?.keywords) {
        const keywordsStr = Array.isArray(extractedKeywords2) ? extractedKeywords2.join(', ') : String(extractedKeywords2)
        const keywordsEmbeddings = await Promise.all([
          embed(keywordsStr),
          embed(dataset.groundTruth.keywords.join(', '))
        ])
        keywordsSimilarity2 = cosineSimilarity(keywordsEmbeddings[0], keywordsEmbeddings[1])
      }

      console.log(`   ✅ With metadata: desc_sim=${descriptionSimilarity2?.toFixed(4) || 'N/A'}, kw_sim=${keywordsSimilarity2?.toFixed(4) || 'N/A'}`)

      // ─── Compute comparisons ────────────────────────────────────────────────
      console.log('\n📊 Phase 3: Computing comparisons')

      let descriptionSimilarityDelta: number | undefined
      let keywordsSimilarityDelta: number | undefined
      let descriptionFeatureSimilarity: number | undefined
      let keywordsFeatureSimilarity: number | undefined

      if (descriptionSimilarity1 !== undefined && descriptionSimilarity2 !== undefined) {
        descriptionSimilarityDelta = descriptionSimilarity2 - descriptionSimilarity1
        console.log(`   Description to ground truth delta: ${descriptionSimilarityDelta > 0 ? '📈' : '📉'} ${descriptionSimilarityDelta.toFixed(4)}`)
      }

      if (keywordsSimilarity1 !== undefined && keywordsSimilarity2 !== undefined) {
        keywordsSimilarityDelta = keywordsSimilarity2 - keywordsSimilarity1
        console.log(`   Keywords to ground truth delta: ${keywordsSimilarityDelta > 0 ? '📈' : '📉'} ${keywordsSimilarityDelta.toFixed(4)}`)
      }

      // Similarity between extracted features with/without metadata
      if (extractedDescription1 && extractedDescription2) {
        const descEmbeddings = await Promise.all([
          embed(typeof extractedDescription1 === 'string' ? extractedDescription1 : String(extractedDescription1)),
          embed(typeof extractedDescription2 === 'string' ? extractedDescription2 : String(extractedDescription2))
        ])
        descriptionFeatureSimilarity = cosineSimilarity(descEmbeddings[0], descEmbeddings[1])
        console.log(`   Description extraction change: ${descriptionFeatureSimilarity.toFixed(4)}`)
      }

      if (extractedKeywords1 && extractedKeywords2) {
        const kw1Str = Array.isArray(extractedKeywords1) ? extractedKeywords1.join(', ') : String(extractedKeywords1)
        const kw2Str = Array.isArray(extractedKeywords2) ? extractedKeywords2.join(', ') : String(extractedKeywords2)
        const keywordEmbeddings = await Promise.all([
          embed(kw1Str),
          embed(kw2Str)
        ])
        keywordsFeatureSimilarity = cosineSimilarity(keywordEmbeddings[0], keywordEmbeddings[1])
        console.log(`   Keywords extraction change: ${keywordsFeatureSimilarity.toFixed(4)}`)
      }

      const duration = Date.now() - startTime
      const result: TestResult = {
        datasetName: dataset.name,
        withoutMetadata: {
          sessionId: sessionId1,
          extractedDescription: typeof extractedDescription1 === 'string' ? extractedDescription1.substring(0, 80) : String(extractedDescription1),
          extractedKeywords: extractedKeywords1,
          descriptionSimilarity: descriptionSimilarity1,
          keywordsSimilarity: keywordsSimilarity1
        },
        withMetadata: {
          sessionId: sessionId2,
          extractedDescription: typeof extractedDescription2 === 'string' ? extractedDescription2.substring(0, 80) : String(extractedDescription2),
          extractedKeywords: extractedKeywords2,
          descriptionSimilarity: descriptionSimilarity2,
          keywordsSimilarity: keywordsSimilarity2
        },
        comparison: {
          descriptionSimilarityDelta,
          keywordsSimilarityDelta,
          descriptionFeatureSimilarity,
          keywordsFeatureSimilarity
        },
        status: 'success',
        duration
      }

      results.push(result)
    } catch (error) {
      const duration = Date.now() - startTime
      const result: TestResult = {
        datasetName: dataset.name,
        withoutMetadata: {
          sessionId: 'N/A'
        },
        withMetadata: {
          sessionId: 'N/A'
        },
        comparison: {},
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        duration
      }
      results.push(result)
      console.log(`❌ Failed: ${result.error}`)
    }
  }

  // Print results summary
  printResultsSummary(results)
}

function printResultsSummary(results: TestResult[]) {
  console.log(`\n${'='.repeat(100)}`)
  console.log('Test Results Summary')
  console.log(`${'='.repeat(100)}\n`)

  const successful = results.filter(r => r.status === 'success')
  const failed = results.filter(r => r.status === 'failed')

  console.log(`Total: ${results.length} | ✅ Successful: ${successful.length} | ❌ Failed: ${failed.length}\n`)

  // Detailed results
  console.log('Detailed Results:')
  console.log('─'.repeat(100))
  
  for (const result of results) {
    console.log(`\n📊 ${result.datasetName}`)
    console.log(`   Status: ${result.status === 'success' ? '✅ Success' : '❌ Failed'}`)
    console.log(`   Duration: ${(result.duration / 1000).toFixed(2)}s`)
    
    if (result.status === 'success') {
      console.log(`\n   WITHOUT Metadata:`)
      if (result.withoutMetadata.descriptionSimilarity !== undefined) {
        console.log(`     • Description similarity to ground truth: ${result.withoutMetadata.descriptionSimilarity.toFixed(4)}`)
      }
      if (result.withoutMetadata.keywordsSimilarity !== undefined) {
        console.log(`     • Keywords similarity to ground truth: ${result.withoutMetadata.keywordsSimilarity.toFixed(4)}`)
      }

      console.log(`\n   WITH Metadata:`)
      if (result.withMetadata.descriptionSimilarity !== undefined) {
        console.log(`     • Description similarity to ground truth: ${result.withMetadata.descriptionSimilarity.toFixed(4)}`)
      }
      if (result.withMetadata.keywordsSimilarity !== undefined) {
        console.log(`     • Keywords similarity to ground truth: ${result.withMetadata.keywordsSimilarity.toFixed(4)}`)
      }

      console.log(`\n   Metadata Impact (Ground Truth Comparison):`)
      if (result.comparison.descriptionSimilarityDelta !== undefined) {
        const delta = result.comparison.descriptionSimilarityDelta
        const trend = delta > 0 ? '📈 IMPROVED' : delta < 0 ? '📉 DECLINED' : '➡️  NO CHANGE'
        console.log(`     • Description: ${trend} (${delta > 0 ? '+' : ''}${delta.toFixed(4)})`)
      }
      if (result.comparison.keywordsSimilarityDelta !== undefined) {
        const delta = result.comparison.keywordsSimilarityDelta
        const trend = delta > 0 ? '📈 IMPROVED' : delta < 0 ? '📉 DECLINED' : '➡️  NO CHANGE'
        console.log(`     • Keywords: ${trend} (${delta > 0 ? '+' : ''}${delta.toFixed(4)})`)
      }

      console.log(`\n   Feature Extraction Consistency:`)
      if (result.comparison.descriptionFeatureSimilarity !== undefined) {
        console.log(`     • Description extraction similarity: ${result.comparison.descriptionFeatureSimilarity.toFixed(4)}`)
      }
      if (result.comparison.keywordsFeatureSimilarity !== undefined) {
        console.log(`     • Keywords extraction similarity: ${result.comparison.keywordsFeatureSimilarity.toFixed(4)}`)
      }
    } else {
      console.log(`   Error: ${result.error}`)
    }
  }

  // Aggregate statistics
  if (successful.length > 0) {
    console.log(`\n${'─'.repeat(100)}`)
    console.log('Aggregate Statistics:')
    
    const descDeltasWithout = successful.map(r => r.withoutMetadata.descriptionSimilarity).filter(v => v !== undefined) as number[]
    const descDeltasWith = successful.map(r => r.withMetadata.descriptionSimilarity).filter(v => v !== undefined) as number[]
    const kwDeltasWithout = successful.map(r => r.withoutMetadata.keywordsSimilarity).filter(v => v !== undefined) as number[]
    const kwDeltasWith = successful.map(r => r.withMetadata.keywordsSimilarity).filter(v => v !== undefined) as number[]

    if (descDeltasWithout.length > 0) {
      const avgWithout = descDeltasWithout.reduce((a, b) => a + b) / descDeltasWithout.length
      console.log(`\n  Description Similarity (Without Metadata): avg=${avgWithout.toFixed(4)}`)
    }

    if (descDeltasWith.length > 0) {
      const avgWith = descDeltasWith.reduce((a, b) => a + b) / descDeltasWith.length
      console.log(`  Description Similarity (With Metadata): avg=${avgWith.toFixed(4)}`)
      
      if (descDeltasWithout.length > 0) {
        const avgWithout = descDeltasWithout.reduce((a, b) => a + b) / descDeltasWithout.length
        const improvement = avgWith - avgWithout
        console.log(`  Average Description Improvement: ${improvement > 0 ? '📈' : '📉'} ${improvement.toFixed(4)}`)
      }
    }

    if (kwDeltasWithout.length > 0) {
      const avgWithout = kwDeltasWithout.reduce((a, b) => a + b) / kwDeltasWithout.length
      console.log(`\n  Keywords Similarity (Without Metadata): avg=${avgWithout.toFixed(4)}`)
    }

    if (kwDeltasWith.length > 0) {
      const avgWith = kwDeltasWith.reduce((a, b) => a + b) / kwDeltasWith.length
      console.log(`  Keywords Similarity (With Metadata): avg=${avgWith.toFixed(4)}`)
      
      if (kwDeltasWithout.length > 0) {
        const avgWithout = kwDeltasWithout.reduce((a, b) => a + b) / kwDeltasWithout.length
        const improvement = avgWith - avgWithout
        console.log(`  Average Keywords Improvement: ${improvement > 0 ? '📈' : '📉'} ${improvement.toFixed(4)}`)
      }
    }
  }

  console.log(`\n${'='.repeat(100)}\n`)
}

main()