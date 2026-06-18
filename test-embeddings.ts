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

//   Overview with sources of these datasets:
  // - https://www.kaggle.com/datasets/emnard1/stroke-based-handwritingdata-for-alzheimer-disease?utm_source=chatgpt.com
  //  - https://www.sciencedirect.com/science/article/pii/S0010482525003907

const TEST_DATASETS: TestDataset[] = [
  {
    name: 'HTTPS',
    kaggleUrl: "https://www.kaggle.com/datasets/inhngcn/https-traffic-classification",
    publicationUrl: "https://www.nature.com/articles/s41598-025-21261-6",
    publicationPdfPath: "./publications/https.pdf",
    groundTruth: {
      description: 'Network Traffic Data to classify web activities',
      keywords: ['business', 'internet', 'https']
    }
  },
  {
    name: 'SHAAD',
    kaggleUrl: 'https://www.kaggle.com/datasets/emnard1/stroke-based-handwritingdata-for-alzheimer-disease',
    publicationPdfPath: "./publications/shaad.pdf",
    groundTruth: {
      description: "Stroke-Level Handwriting Dynamics for Early Alzheimer's Detection",
      keywords: ['tabular', 'artificial intelligence', 'europe', 'diseases']
    }
  },
  // {
  //   name: 'Credit card fraud',
  //   kaggleUrl: 'https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud',
  //   publicationUrl: 'https://arxiv.org/pdf/1904.10604',
  //   publicationPdfPath: './publications/creditcard.pdf',
  //   groundTruth: {
  //     description: 'Archive containing all the contents of the Credit Card Fraud Detection dataset',
  //     keywords: ['finance', 'government', 'crime']
  //   },
  //   processed: false
  // },
  {
    name: 'MedCost',
    kaggleUrl: 'https://www.kaggle.com/datasets/mirichoi0218/insurance',
    publicationUrl: 'https://arxiv.org/pdf/2304.12605',
    publicationPdfPath: './publications/medcost.pdf',
    groundTruth: {
      description: 'Medical Cost Personal Datasets Insurance Forecast by using Linear Regression',
      keywords: ['healthcare', 'finance', 'insurance', 'education', 'health']
    },
    processed: false,
  },
  {
    name: 'AES-data',
    kaggleUrl: 'https://www.kaggle.com/datasets/jaytonde/aes-dataset',
    publicationUrl: 'https://arxiv.org/pdf/1909.09482',
    publicationPdfPath: './publications/automatedessay.pdf',
    groundTruth: {
      description: 'Archive containing all the contents of the AES-DATASET dataset',
      keywords: []
    },
    processed: false,
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
    processed: false
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
const CACHE_FILE = './test-results-cache.json'

interface CachedPhaseResult {
  description?: string
  descriptionConfidence?: number
  descriptionSimilarity?: number
  keywords?: string | string[]
  keywordsConfidence?: number
  keywordsSimilarity?: number
  timestamp: number
}

interface CachedRun {
  'no-metadata'?: CachedPhaseResult
  'base-metadata'?: CachedPhaseResult
  'with-pdf'?: CachedPhaseResult
}

interface DistStats {
  values: number[]
  mean: number
  sigma: number
}

interface ResultsCache {
  [datasetName: string]: CachedRun[] | DistStats[] | undefined
}

interface TestRun {
  descriptionSimilarity?: number
  descriptionConfidence?: number
  keywordsSimilarity?: number
  keywordsConfidence?: number
}

interface TestResult {
  datasetName: string
  noMetadata: TestRun
  baseMetadata: TestRun
  withPDF: TestRun
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
  return data.jobId
}

async function waitForDownloadCompletion(sessionId: string, maxWaitSeconds: number = 1200): Promise<void> {
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

    // Wait 5 seconds before polling again
    await new Promise(resolve => setTimeout(resolve, 5000))
  }

  throw new Error(`Download did not complete within ${maxWaitSeconds} seconds`)
}

async function getDownloadJobResults(sessionId: string) {
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
  return job?.returnvalue
}


async function startProcessing(
  sessionId: string,
  schemas: Record<string, boolean>,
  inferencePercentage: number,
  stopMetadata?: boolean
) {
  const body = {
    schemas,
    customProperties: [],
    inferencePercentage,
    stopMetadata
  }

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
}

async function waitForProcessingCompletion(sessionId: string, maxWaitSeconds: number = 1200): Promise<void> {
  const startTime = Date.now()
  const maxWaitMs = maxWaitSeconds * 1000
  let pollCount = 0

  while (Date.now() - startTime < maxWaitMs) {
    pollCount++
    try {
      const response = await fetch(`${API_BASE}/api/job/process/status`, {
        headers: {
          'Cookie': `sessionId=${sessionId}`
        }
      })

      if (!response.ok) {
        console.log(`   [${sessionId}] Poll #${pollCount}: HTTP ${response.status} ${response.statusText} - waiting...`)
        await new Promise(resolve => setTimeout(resolve, 20000))
        continue
      }

      const text = await response.text()
      if (!text) {
        console.log(`   [${sessionId}] Poll #${pollCount}: Empty response - DONE`)
        return
      }

      let data
      try {
        data = JSON.parse(text)
      } catch (parseErr) {
        console.log(`   [${sessionId}] Poll #${pollCount}: Parse error: ${parseErr instanceof Error ? parseErr.message : parseErr} - text: ${text.substring(0, 100)}`)
        await new Promise(resolve => setTimeout(resolve, 20000))
        continue
      }
      console.log(`   [${sessionId}] Poll #${pollCount}: ${JSON.stringify(data).substring(0, 120)}...`)

      // If job has a returnvalue, it's definitely done
      if (data?.returnvalue) {
        console.log(`   [${sessionId}] COMPLETE: Has returnvalue after ${pollCount} polls`)
        return
      }

      // If response is an empty object, no job running
      if (typeof data === 'object' && data !== null && Object.keys(data).length === 0) {
        console.log(`   [${sessionId}] COMPLETE: Empty object after ${pollCount} polls`)
        return
      }

      // If we got here and it's null/falsy, job is done
      if (!data) {
        console.log(`   [${sessionId}] COMPLETE: Falsy response after ${pollCount} polls`)
        return
      }

      const elapsed = (Date.now() - startTime) / 1000
      console.log(`   [${sessionId}] Still running after ${elapsed.toFixed(0)}s (${pollCount} polls) - waiting...`)
    } catch (err) {
      console.log(`   [${sessionId}] Poll #${pollCount} ERROR: ${err instanceof Error ? err.message : err}`)
      throw err
    }
    // Wait 20 seconds before polling again
    await new Promise(resolve => setTimeout(resolve, 20000))
  }

  throw new Error(`Processing did not complete within ${maxWaitSeconds} seconds`)
}

async function getLatestJobResults(sessionId: string, maxRetries: number = 10) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
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
      if (attempt < maxRetries) {
        console.log(`   [${sessionId}] Attempt #${attempt}: Empty response from endpoint`)
        await new Promise(resolve => setTimeout(resolve, 1000))
        continue
      }
      throw new Error('Results endpoint returned empty response after retries')
    }

    const job = JSON.parse(text)
    console.log(`   [${sessionId}] Attempt #${attempt}: Job response: ${JSON.stringify(job).substring(0, 150)}...`)
    const results = job?.returnvalue
    
    if (!results) {
      console.log(`   [${sessionId}] Attempt #${attempt}: No returnvalue in job. Job keys: ${Object.keys(job).join(', ')}`)
      if (attempt < maxRetries) {
        console.log(`   [${sessionId}] Retrying... (${attempt}/${maxRetries})`)
        await new Promise(resolve => setTimeout(resolve, 1000))
        continue
      }
      throw new Error(`No results in job returnvalue after retries`)
    }
    
    console.log(`   [${sessionId}] ✓ Results found: dataset keys = ${results.dataset ? Object.keys(results.dataset).length : 0}, first 3 keys: ${results.dataset ? Object.keys(results.dataset).slice(0, 3).join(', ') : 'N/A'}`)
    console.log(`   [${sessionId}] Results fetched successfully`)
    return results
  }
  
  throw new Error('Failed to fetch results after max retries')
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

async function loadCache(): Promise<ResultsCache> {
  try {
    const content = await fs.readFile(CACHE_FILE, 'utf-8')
    return JSON.parse(content)
  } catch {
    return {}
  }
}

async function saveCache(cache: ResultsCache): Promise<void> {
  try {
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2))
  } catch (err) {
    console.log(`⚠️ Failed to save cache: ${err instanceof Error ? err.message : err}`)
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

// ponytail: single extraction phase with flexible metadata control
async function runPhase(
  sessionId: string,
  dataset: TestDataset,
  stopMetadata: boolean,
  uploadPDF: boolean,
  cache: ResultsCache,
  runIndex: number
): Promise<TestRun> {
  const phase = stopMetadata ? 'no-metadata' : uploadPDF ? 'with-pdf' : 'base-metadata'
  
  // Check if this exact run+phase is cached
  const runs = cache[dataset.name] as CachedRun[] | undefined
  const cachedRun = runs?.[runIndex]?.[phase as keyof CachedRun] as CachedPhaseResult | undefined
  
  if (cachedRun) {
    console.log(`   [${sessionId}] Phase: ${phase} (run ${runIndex + 1}/5) - CACHED (${((Date.now() - cachedRun.timestamp) / 1000 / 60).toFixed(1)}min old)`)
    return {
      descriptionSimilarity: cachedRun.descriptionSimilarity,
      descriptionConfidence: cachedRun.descriptionConfidence,
      keywordsSimilarity: cachedRun.keywordsSimilarity,
      keywordsConfidence: cachedRun.keywordsConfidence
    }
  }
  
  // Add delay between phases to avoid backend queue issues
  if (phase !== 'no-metadata') {
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  
  console.log(`   [${sessionId}] Phase: ${phase} (run ${runIndex + 1}/5) - Starting download...`)
  
  await startDownload(sessionId, dataset.kaggleUrl, 'Kaggle', extractKaggleId(dataset.kaggleUrl))
  await waitForDownloadCompletion(sessionId)
  console.log(`   [${sessionId}] Download complete`)
  
  if (uploadPDF && dataset.publicationPdfPath && await fileExists(dataset.publicationPdfPath)) {
    try {
      console.log(`   [${sessionId}] Uploading PDF metadata...`)
      await uploadMetadata(sessionId, dataset.publicationPdfPath)
      console.log(`   [${sessionId}] PDF uploaded`)
    } catch (err) {
      console.log(`⚠️ Metadata upload failed: ${err instanceof Error ? err.message : err}`)
    }
  }
  
  console.log(`   [${sessionId}] Starting processing...`)
  const processStartTime = Date.now()
  await startProcessing(sessionId, SCHEMA_KEYS, INFERENCE_PERCENTAGE, stopMetadata)
  await new Promise(resolve => setTimeout(resolve, 1000))
  console.log(`   [${sessionId}] Waiting for processing to complete...`)
  await waitForProcessingCompletion(sessionId)
  const processDuration = (Date.now() - processStartTime) / 1000
  console.log(`   [${sessionId}] Processing done after ${processDuration.toFixed(1)}s`)
  // Buffer delay to ensure results are written before fetching
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  const results = await getLatestJobResults(sessionId)
  const description = results?.dataset?.['dataset.description']?.result?.value
  const keywords = results?.dataset?.['dataset.theme']?.result?.value
  
  // Compute similarities
  const descriptionSimilarity = await computeSimilarities(description, dataset.groundTruth?.description)
  const keywordsSimilarity = await computeSimilarities(keywords, dataset.groundTruth?.keywords)
  
  const result: TestRun = {
    descriptionSimilarity,
    descriptionConfidence: results?.dataset?.['dataset.description']?.result?.confidence,
    keywordsSimilarity,
    keywordsConfidence: results?.dataset?.['dataset.theme']?.result?.confidence
  }
  
  // Cache this result
  if (!cache[dataset.name]) cache[dataset.name] = []
  const runsArray = cache[dataset.name] as CachedRun[]
  if (!runsArray[runIndex]) runsArray[runIndex] = {}
  runsArray[runIndex][phase as keyof CachedRun] = {
    description,
    descriptionConfidence: result.descriptionConfidence,
    descriptionSimilarity: result.descriptionSimilarity,
    keywords,
    keywordsConfidence: result.keywordsConfidence,
    keywordsSimilarity: result.keywordsSimilarity,
    timestamp: Date.now()
  }
  
  // Save cache to file immediately
  await saveCache(cache)
  console.log(`   [${sessionId}] Phase: ${phase} (run ${runIndex + 1}/5) - Cached ✓`)
  
  return result
}

async function uploadMetadata(sessionId: string, filePath: string): Promise<void> {
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
}

// ponytail: extract similarity computation, used by both phases
async function computeSimilarities(
  extracted: string | string[] | undefined,
  groundTruth: string | string[] | undefined
): Promise<number | undefined> {
  if (!extracted || !groundTruth) return undefined
  const extractStr = Array.isArray(extracted) ? extracted.join(', ') : String(extracted)
  const truthStr = Array.isArray(groundTruth) ? groundTruth.join(', ') : String(groundTruth)
  const embeddings = await Promise.all([embed(extractStr), embed(truthStr)])
  return cosineSimilarity(embeddings[0], embeddings[1])
}

function calculateStats(values: number[]): DistStats {
  const filtered = values.filter(v => v !== undefined)
  if (filtered.length === 0) {
    return { values: [], mean: 0, sigma: 0 }
  }
  const mean = filtered.reduce((a, b) => a + b) / filtered.length
  const variance = filtered.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / filtered.length
  const sigma = Math.sqrt(variance)
  return { values: filtered, mean, sigma }
}

function extractPhaseValues(runs: CachedRun[] | undefined, phase: 'no-metadata' | 'base-metadata' | 'with-pdf', key: 'descriptionSimilarity' | 'keywordsSimilarity'): number[] {
  if (!Array.isArray(runs)) return []
  return runs.map(run => run[phase]?.[key]).filter(v => v !== undefined) as number[]
}

async function main() {
  const results: TestResult[] = []
  const cache = await loadCache()
  console.log(`\n${'='.repeat(100)}`)
  console.log('Dataset Extraction Test Runner (5 Runs × 3 Metadata Scenarios with Stats)')
  console.log(`${'='.repeat(100)}\n`)
  console.log(`📂 Cache file: ${CACHE_FILE}`)
  if (Object.keys(cache).length > 0) {
    const datasetNames = Object.keys(cache).filter(k => !k.includes('.__stats__'))
    console.log(`📂 Loaded cache with: ${datasetNames.join(', ')}\n`)
  } else {
    console.log(`📂 Starting fresh (no cache found)\n`)
  }

  const NUM_RUNS = 5
  const unDoneDatasets = TEST_DATASETS.filter(x => !x.processed)
  
  for (let datasetIdx = 0; datasetIdx < unDoneDatasets.length; datasetIdx++) {
    const dataset = unDoneDatasets[datasetIdx]
    console.log(`\n[${'█'.repeat(datasetIdx + 1)}${'░'.repeat(unDoneDatasets.length - datasetIdx - 1)}] Testing ${datasetIdx + 1}/${unDoneDatasets.length}: ${dataset.name}`)
    console.log('─'.repeat(100))

    const runsData: TestResult[] = []
    
    // Run 5 times, each with 3 phases
    for (let runIdx = 0; runIdx < NUM_RUNS; runIdx++) {
      const startTime = Date.now()
      console.log(`\n  Run ${runIdx + 1}/${NUM_RUNS}`)
      
      try {
        // Run 3 phases sequentially
        const noMetadata = await runPhase(await createSession(), dataset, true, false, cache, runIdx)
        const baseMetadata = await runPhase(await createSession(), dataset, false, false, cache, runIdx)
        const withPDF = await runPhase(await createSession(), dataset, false, true, cache, runIdx)

        const duration = Date.now() - startTime
        const result: TestResult = {
          datasetName: dataset.name,
          noMetadata,
          baseMetadata,
          withPDF,
          status: 'success',
          duration
        }

        runsData.push(result)
        console.log(`  ✅ Run ${runIdx + 1} completed in ${(duration / 1000).toFixed(2)}s`)
      } catch (error) {
        const duration = Date.now() - startTime
        const result: TestResult = {
          datasetName: dataset.name,
          noMetadata: {},
          baseMetadata: {},
          withPDF: {},
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          duration
        }
        runsData.push(result)
        console.log(`  ❌ Run ${runIdx + 1} failed: ${result.error}`)
      }
    }
    
    results.push(...runsData)
    
    // Calculate and save stats for this dataset
    const successful = runsData.filter(r => r.status === 'success')
    if (successful.length > 0) {
      console.log(`\n  📊 Calculating statistics for ${dataset.name}...`)
      
      const stats = {
        'no-metadata.descriptionSimilarity': calculateStats(successful.map(r => r.noMetadata.descriptionSimilarity).filter(v => v !== undefined) as number[]),
        'base-metadata.descriptionSimilarity': calculateStats(successful.map(r => r.baseMetadata.descriptionSimilarity).filter(v => v !== undefined) as number[]),
        'with-pdf.descriptionSimilarity': calculateStats(successful.map(r => r.withPDF.descriptionSimilarity).filter(v => v !== undefined) as number[]),
        'no-metadata.keywordsSimilarity': calculateStats(successful.map(r => r.noMetadata.keywordsSimilarity).filter(v => v !== undefined) as number[]),
        'base-metadata.keywordsSimilarity': calculateStats(successful.map(r => r.baseMetadata.keywordsSimilarity).filter(v => v !== undefined) as number[]),
        'with-pdf.keywordsSimilarity': calculateStats(successful.map(r => r.withPDF.keywordsSimilarity).filter(v => v !== undefined) as number[])
      }
      
      // Store stats in cache
      if (!cache[`${dataset.name}.__stats__`]) {
        cache[`${dataset.name}.__stats__`] = []
      }
      ;(cache[`${dataset.name}.__stats__`] as any) = stats
      
      // Print stats
      console.log(`\n  Statistics for ${dataset.name}:`)
      console.log(`    Description Similarity:`)
      console.log(`      • No Metadata:   mean=${stats['no-metadata.descriptionSimilarity'].mean.toFixed(4)}, σ=${stats['no-metadata.descriptionSimilarity'].sigma.toFixed(4)}`)
      console.log(`      • Base Metadata: mean=${stats['base-metadata.descriptionSimilarity'].mean.toFixed(4)}, σ=${stats['base-metadata.descriptionSimilarity'].sigma.toFixed(4)}`)
      console.log(`      • With PDF:      mean=${stats['with-pdf.descriptionSimilarity'].mean.toFixed(4)}, σ=${stats['with-pdf.descriptionSimilarity'].sigma.toFixed(4)}`)
      
      console.log(`    Keywords Similarity:`)
      console.log(`      • No Metadata:   mean=${stats['no-metadata.keywordsSimilarity'].mean.toFixed(4)}, σ=${stats['no-metadata.keywordsSimilarity'].sigma.toFixed(4)}`)
      console.log(`      • Base Metadata: mean=${stats['base-metadata.keywordsSimilarity'].mean.toFixed(4)}, σ=${stats['base-metadata.keywordsSimilarity'].sigma.toFixed(4)}`)
      console.log(`      • With PDF:      mean=${stats['with-pdf.keywordsSimilarity'].mean.toFixed(4)}, σ=${stats['with-pdf.keywordsSimilarity'].sigma.toFixed(4)}`)
      
      await saveCache(cache)
      console.log(`\n  💾 Intermediate results saved to ${CACHE_FILE}`)
  }

  printResultsSummary(results)
}

function printResultsSummary(results: TestResult[]) {
  console.log(`\n${'='.repeat(100)}`)
  console.log('Test Results Summary')
  console.log(`${'='.repeat(100)}\n`)

  const successful = results.filter(r => r.status === 'success')
  const failed = results.filter(r => r.status === 'failed')

  console.log(`Total runs: ${results.length} | ✅ Successful: ${successful.length} | ❌ Failed: ${failed.length}\n`)

  console.log('Detailed Results:')
  console.log('─'.repeat(100))
  
  for (const result of results) {
    console.log(`\n📊 ${result.datasetName} - Run`)
    console.log(`   Duration: ${(result.duration / 1000).toFixed(2)}s`)
    
    if (result.status === 'success') {
      const fmt = (v?: number) => v !== undefined ? v.toFixed(4) : 'N/A'
      
      console.log(`\n   No Metadata:`)
      console.log(`     • Description: ${fmt(result.noMetadata.descriptionSimilarity)} (conf: ${fmt(result.noMetadata.descriptionConfidence)})`)
      console.log(`     • Keywords:    ${fmt(result.noMetadata.keywordsSimilarity)} (conf: ${fmt(result.noMetadata.keywordsConfidence)})`)
      
      console.log(`\n   Base Metadata:`)
      console.log(`     • Description: ${fmt(result.baseMetadata.descriptionSimilarity)} (conf: ${fmt(result.baseMetadata.descriptionConfidence)})`)
      console.log(`     • Keywords:    ${fmt(result.baseMetadata.keywordsSimilarity)} (conf: ${fmt(result.baseMetadata.keywordsConfidence)})`)
      
      console.log(`\n   With PDF:`)
      console.log(`     • Description: ${fmt(result.withPDF.descriptionSimilarity)} (conf: ${fmt(result.withPDF.descriptionConfidence)})`)
      console.log(`     • Keywords:    ${fmt(result.withPDF.keywordsSimilarity)} (conf: ${fmt(result.withPDF.keywordsConfidence)})`)
    } else {
      console.log(`   ❌ Error: ${result.error}`)
    }
  }

  console.log(`\n${'='.repeat(100)}\n`)
}

main()