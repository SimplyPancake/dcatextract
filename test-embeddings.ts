import { randomUUID } from 'crypto'
import OpenAI from 'openai'
import fs from 'fs/promises'
import path from 'path'

const API_BASE = process.env.API_BASE || 'http://localhost:3000'

const client = new OpenAI({
  baseURL: process.env.NUXT_LLM_URL,
  apiKey: process.env.NUXT_LLM_TOKEN,
})

// Helper functions to detect provider and extract identifiers
function detectProvider(url: string): 'GitHub' | 'HuggingFace' | 'Zenodo' | 'Kaggle' {
  if (url.includes('github.com')) return 'GitHub'
  if (url.includes('huggingface.co')) return 'HuggingFace'
  if (url.includes('zenodo.org')) return 'Zenodo'
  if (url.includes('kaggle.com')) return 'Kaggle'
  throw new Error(`Unknown provider in URL: ${url}`)
}

function extractIdentifier(url: string, provider: 'GitHub' | 'HuggingFace' | 'Zenodo' | 'Kaggle'): string {
  switch (provider) {
    case 'GitHub': {
      const match = url.match(/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git|\/)?$/)
      if (!match) throw new Error(`Invalid GitHub URL format: ${url}`)
      return `${match[1]}/${match[2]}`
    }
    case 'HuggingFace': {
      const match = url.match(/huggingface\.co\/datasets\/(.+?)(?:\/|$)/)
      if (!match) throw new Error(`Invalid HuggingFace URL format: ${url}`)
      return match[1]
    }
    case 'Zenodo': {
      const match = url.match(/zenodo\.org\/records?\/(\d+)/)
      if (!match) throw new Error(`Invalid Zenodo URL format: ${url}`)
      return match[1]
    }
    case 'Kaggle': {
      const match = url.match(/kaggle\.com\/datasets\/(.+)$/)
      if (!match) throw new Error(`Invalid Kaggle URL format: ${url}`)
      return match[1]
    }
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}

// Test datasets configuration
interface TestDataset {
  name: string
  url: string  // Supports GitHub, HuggingFace, Zenodo, or Kaggle URLs
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
    name: 'ArmourTraits',
    url: "https://zenodo.org/records/20407495",
    publicationUrl: "https://www.sciencedirect.com/science/article/pii/S2352340926004567",
    publicationPdfPath: "./publications/armour.pdf",
    groundTruth: {
      description: 'ArmourTraits is a comparative dataset quantifying variation in defensive morphology across 131 squamate species belonging to two distantly related lineages, Cordyliformes and Anguimorpha, which independently evolved osteoderm-based body armour. The dataset integrates micro-computed tomography–derived morphological measurements of osteoderm expression and hindlimb skeletal traits with species-level ecological, life-history, and environmental variables. It also includes estimates of predation risk and a time-calibrated phylogeny for all included taxa. By combining quantitative metrics of armour development with locomotor morphology and ecological context, ArmourTraits provides a standardized framework for comparative analyses of defensive trait evolution. The dataset is designed to facilitate phylogenetic comparative studies addressing ecological correlates of armour variation, functional trade-offs between defence and locomotion, convergent evolution, and macroevolutionary diversification of defensive traits in squamates.',
      keywords: ['Predator-Prey Interactions', 'Squamata']
    }
  },
  {
    name: 'HoneyPot',
    url: 'https://zenodo.org/records/20435481',
    publicationPdfPath: './publications/honeypot.pdf',
    publicationUrl: 'https://www.sciencedirect.com/science/article/pii/S2352340926004129#refdata001',
    groundTruth: {
      // 'Overview' part of the DCAT description was taken since it's description had multiple headers in it (like Overview, Research Context, Affiliation etc)
      description: 'This dataset contains 145,425 security events collected by a custom multi-threaded SSH Honeypot. The data reflects real-world automated and manual attack patterns against Linux-based systems, captured over a focused 4-month observation window from July 27, 2025, to November 14, 2025.',
      keywords: ['Cybersecurity', 'SSH Honeypot', 'Botnet Analysis', 'Threat Intelligence', 'Intrusion Detection', 'Open Data']
    }
  },
  {
    name: 'Occupancy',
    url: 'https://zenodo.org/records/20548374',
    publicationUrl: 'https://www.sciencedirect.com/science/article/pii/S2352340926004981#refdata001',
    publicationPdfPath: './publications/occupancy.pdf',
    groundTruth: {
      description: 'This dataset presents a multimodal dataset collected in a real smart environment located at the Pontifical Catholic University of Rio Grande do Sul (PUCRS), Brazil. The dataset documents environmental, electrical, and device-interaction measurements collected from a heterogeneous Internet of Things (IoT) deployment composed of commercial smart devices and a custom ESP32-based sensing node. Environmental variables include carbon dioxide concentration, temperature, relative humidity, light intensity, and sound pressure level. Electrical measurements include instantaneous power, voltage, current, and device-state measurements collected from smart sockets, switches, and a dedicated server. Data were collected continuously under routine academic workspace operation, reflecting natural occupancy fluctuations, restricted-access conditions, and heterogeneous network behavior. The custom sensing node was programmed in Arduino C++ and exposed measurements via HTTP requests, while commercial Tuya-based devices were polled locally through the Tuya LAN protocol using the TuyAPI library. Records were stored in structured JSON format, with a common timestamp assigned at the end of each acquisition cycle. Each record therefore represents the aggregation of values collected within the same 10-second polling window rather than perfectly simultaneous measurements acquired at the exact same instant. These data can support research in occupancy detection, energy usage analysis, anomaly detection, and smart-building experimentation. The dataset also provides a documented example of a real-world IoT deployment suitable for replication or comparative studies.',
      keywords: ['Internet of Things', 'Dataset', 'Occupancy Estimation', 'IoT']
    }
  },
  {
    name: 'CannabisUse',
    url: 'https://zenodo.org/records/20214862',
    publicationUrl: 'https://www.sciencedirect.com/science/article/pii/S2352340926004592#refdata001',
    publicationPdfPath: './publications/cannabis.pdf',
    groundTruth: {
      keywords: ['natural language processing', 'sentiment analysis', 'cannabis', 'pain management', 'autoimmune rheumatic disease'],
      description: 'Abstract Using publicly accessible Reddit posts, we developed a manually annotated dataset for traditional and aspect-based sentiment analysis (ABSA) of cannabis-related discussions in the context of pain management. The dataset consists of 479 post-aspect pairs extracted from specific Reddit communities associated with autoimmune rheumatic diseases (ARDs). We filtered posts using a structured list of cannabis-related terms and extracted context using rule-based sentence segmentation. Subsequently, we manually annotated each post for both traditional and aspect-specific sentiment (positive, negative, neutral). Inter-annotator reliability was assessed using Krippendorff’s ⍺, yielding ⍺ = 0.604 for traditional sentiment and ⍺ = 0.526 for aspect-based sentiment. The dataset offers valuable resources for training, benchmarking, and evaluating machine learning models for ABSA in health-related social media contexts. This dataset can support research in natural language processing, public health informatics, pain medicine, digital epidemiology, and social media-based health monitoring.   File structure cannabis_reddit_absa.csv: Dataset containing Reddit post IDs, matched aspect terms, final traditional and aspect-based sentiment labels, and individual annotator labels for each post–aspect pair. reddit_data_pipeline.ipynb: Jupyter Notebook containing functions for sentence segmentation with spaCy, and matching posts to the cannabis term list to generate post–aspect pairs for annotation. cannabis_lexicon.csv: Complete list of cannabis-related terms used to filter and match relevant content in Reddit posts, including abbreviations, synonyms, and common spellings. annotation_guidelines.pdf: Detailed instructions for annotators, including definitions of sentiment labels (neutral, positive, negative, blank), rules for assigning traditional vs. aspect-based labels, guidance for handling personal experience vs. general commentary, and illustrative examples. top_subreddits_weekly_extraction.py: Python script implementing a data extraction and processing workflow for Reddit using PRAW, with outputs stored in MongoDB. Compatibility with newer versions of PRAW is not guaranteed, and the script may require updates to run.'
    }
  },
  {
    name: 'ANEST',
    url: 'https://zenodo.org/records/18680687',
    publicationUrl: 'https://www.sciencedirect.com/science/article/pii/S2352340926001964#refdata001',
    publicationPdfPath: './publications/anest.pdf',
    groundTruth: {
      // Description was very long, only describing part was taken from reference description
      description: 'ANEST Narrative–Affect Representations (ANAD v1) is a large-scale, fully curated research resource designed to quantify narrative–affect discrepancy using derived, non-identifiable feature representations of human-generated text.',
      keywords: ['narrative-affect discrepancy', 'affective computing', 'NADI', 'Length-of-Context', 'VADER sentiment', 'derived feature dataset', 'computational psychology', 'emotion AI', 'ANEST']
    }
  },
  {
    name: 'LisbonSoil',
    url: 'https://zenodo.org/records/10888728',
    publicationUrl: 'https://www.sciencedirect.com/science/article/pii/S2352340924003603#refdata001',
    publicationPdfPath: './publications/lisbon.pdf',
    groundTruth: {
      description: 'Intact samples extracted from the Areolas da Estefania formation in Lisbon, Portugal, at depths of 8m, 18m and 21m were subjected to drained triaxial compression under constant mean effective stress levels. These files report the measured stress-strain response, as well as the variation of shear stiffness with deformation level. A complementary set of bender element tests were performed on two intact samples collected from depths of 8m and 18m to establish the shear stiffness of the material at very small strains.',
      keywords: ['Soil Mechanics', 'Soil Characterisation', 'Triaxial Testing', 'Bender Elements',' Granular Media', 'Particle Size Distribution']
    }
  },
  {
    name: 'Mining',
    publicationUrl: 'https://www.sciencedirect.com/science/article/pii/S2352340924003172#refdata001',
    url: 'https://zenodo.org/records/10029403',
    publicationPdfPath: './publications/mining.pdf',
    groundTruth: {
      description: 'The dataset includes 44 relevant data attributes from 64 mining and metallurgical sites in 27 countries.',
      keywords: ['resources', 'reserves', 'mining waste', 'secondary raw materials', 'tailings', 'geodatabase', 'circular economy', 'resource assessment']
    }
  },
  {
    name: 'News',
    url: 'https://zenodo.org/records/10531959',
    publicationUrl: 'https://www.sciencedirect.com/science/article/pii/S2352340924003408#refdata001',
    publicationPdfPath: './publications/news.pdf',
    groundTruth: {
      keywords: ['Sesotho dataset', 'Sentiment Analysis', 'Aspect Based Sentiment Analysis'],
      description: 'This dataset contains Sesotho news headlines, which have been annotated for the Sentiment Analysis and the Aspect Based Sentiment Analysis Task.'
    }
  },
  // {
  //   name: 'Handball',
  //   url: 'https://zenodo.org/records/8220670',
  //   publicationUrl: 'https://www.sciencedirect.com/science/article/pii/S2352340923009101#refdata001',
  //   publicationPdfPath: './publications/handball.pdf',
  //   groundTruth: {
  //     keywords: ['handball'],
  //     description: 'Handball play classification dataset. On one hand we have player position and direction (x, y, vx, vy) estimated with a Kalman Filter, and on the other the ball position. For each tuple there is an associated play (right_attack, left_attack, right_transition, left_transition, time_out, right_penal, left_penal). There are two splits train and test.'
  //   }
  // },
  {
    name: 'Karakalpak',
    url: 'https://zenodo.org/records/7691830',
    publicationUrl: 'https://www.sciencedirect.com/science/article/pii/S2352340923002305#refdata001',
    publicationPdfPath: './publications/karalkapak',
    groundTruth: {
      keywords: ['stopwords', 'Karakalpak language'],
      description: 'The dataset presents 3 lists of stopwords in the Karakalpak language. The lists were constructed using three automatic methods applied to the same corpus.'
    }
  },
  {
    name: 'Systems',
    url: 'https://zenodo.org/records/15491930',
    publicationUrl: 'https://www.sciencedirect.com/science/article/pii/S2352340925008066#refdata001',
    publicationPdfPath: './publications/systems.pdf',
    groundTruth: {
      keywords: ['OSeMOSYS', 'Decarbonisation', 'Cost-optimisation', 'Greenhouse gas mitigation', 'AFOLU'],
      description: `Dataset compiled for the purpose of long-term climate, land, energy and water systems (CLEWs) modelling in Laos. The set includes energy-specific data on Laos' energy generation technologies and future potential reserves, electricity generation and demand, electricity exports, emissions, and power transmission and distribution for the years 2020 to 2070. There is also land-specific data on annual crop demand, crop imports, and current and projected land cover changes. Water-specific data focuses on the water supply required for the energy and agriculture sectors, and the output activity ratios for evapotranspiration, groundwater recharge, and surface water run-off for different crop and land cover types. The original data sources are included in the file.`
    }
  },
  {
    name: 'Freiburg',
    url: 'https://zenodo.org/records/7723111',
    publicationUrl: 'https://www.sciencedirect.com/science/article/pii/S2352340923002020#refdata001',
    publicationPdfPath: './publications/freiburg.pdf',
    groundTruth: {
      description: `Dataset compiled for the purpose of long-term climate, land, energy and water systems (CLEWs) modelling in Laos. The set includes energy-specific data on Laos' energy generation technologies and future potential reserves, electricity generation and demand, electricity exports, emissions, and power transmission and distribution for the years 2020 to 2070. There is also land-specific data on annual crop demand, crop imports, and current and projected land cover changes. Water-specific data focuses on the water supply required for the energy and agriculture sectors, and the output activity ratios for evapotranspiration, groundwater recharge, and surface water run-off for different crop and land cover types. The original data sources are included in the file. `,
      keywords: ['research data management', 'research data services', 'user needs', 'technical infrastructure', 'experimental study', 'survey', 'employee demands', 'theory of planned behavior', 'unversity research']
    }
  },
  {
    name: 'Flows',
    publicationUrl: 'https://www.sciencedirect.com/science/article/pii/S2352340923004018#refdata001',
    url: 'https://zenodo.org/records/7930954',
    publicationPdfPath: './publications/flows.pdf',
    groundTruth: {
      description: 'This dataset contains the temperature rise of granular flows reported in the journal article "Experimental investigation of heat generation during granular flow in a rotating drum using infrared thermography"',
      keywords: ['Particulate flow', 'Rotary drum',  'Heat generation', 'Energy dissipation']
    }
  }
]

// Schema keys to process: dataset description and keywords
const SCHEMA_KEYS = {
  "dataset.description": true,
  "distribution.description": true,
  "dataService.description": true,
  "distribution.title": true,
  "dataset.catalog": true,
  "dataService.endpointURL": true,
  "dataset.keyword": true,
  "dataset.theme": true,
  "distribution.uri": true,
  "distribution.language": true,
  "distribution.format": true,
  "dataset.language": true,
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
  sigma: number,
  sem: number
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

    // Log progress message if available
    if (data.job?.progress?.message) {
      console.log(`   [${sessionId}] ⏳ ${data.job.progress.message}`)
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
    stopMetadata,
    useInheritedMetadata: false
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
      // Log progress message if available
      if (data.progress?.message) {
        console.log(`   [${sessionId}] ⏳ ${data.progress.message}`)
      } else {
        console.log(`   [${sessionId}] Poll #${pollCount}: ${JSON.stringify(data).substring(0, 120)}...`)
      }

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
    console.log(`   [${sessionId}] Phase: ${phase} (run ${runIndex + 1}/4) - CACHED (${((Date.now() - cachedRun.timestamp) / 1000 / 60).toFixed(1)}min old)`)
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
  
  console.log(`   [${sessionId}] Phase: ${phase} (run ${runIndex + 1}/4) - Starting download...`)
  
  const provider = detectProvider(dataset.url)
  const identifier = extractIdentifier(dataset.url, provider)
  await startDownload(sessionId, dataset.url, provider, identifier)
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
  const description = results?.dataset?.['dataset.description']?.result?.value ?? 'dataset description'
  const keywords = results?.dataset?.['dataset.theme']?.result?.value ?? 'dataset keywords'
  
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
  console.log(`   [${sessionId}] Phase: ${phase} (run ${runIndex + 1}/4) - Cached ✓`)
  
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
    return { values: [], mean: 0, sigma: 0, sem: 0 }
  }
  const mean = filtered.reduce((a, b) => a + b) / filtered.length
  const variance = filtered.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / filtered.length
  const sigma = Math.sqrt(variance)
  const sem = sigma / Math.sqrt(filtered.length)
  return { values: filtered, mean, sigma, sem }
}

function extractPhaseValues(runs: CachedRun[] | undefined, phase: 'no-metadata' | 'base-metadata' | 'with-pdf', key: 'descriptionSimilarity' | 'keywordsSimilarity'): number[] {
  if (!Array.isArray(runs)) return []
  return runs.map(run => run[phase]?.[key]).filter(v => v !== undefined) as number[]
}

async function repairCacheAndRecalcStats(cache: ResultsCache): Promise<void> {
  const datasets = Object.keys(cache).filter(k => !k.includes('.__stats__'))
  let repaired = 0

  for (const datasetName of datasets) {
    const dataset = TEST_DATASETS.find(d => d.name === datasetName)
    if (!dataset?.groundTruth) continue

    const runs = cache[datasetName] as CachedRun[] | undefined
    if (!Array.isArray(runs)) continue

    for (let runIdx = 0; runIdx < runs.length; runIdx++) {
      const run = runs[runIdx]
      for (const phase of ['no-metadata', 'base-metadata', 'with-pdf'] as const) {
        const phaseResult = run[phase]
        if (!phaseResult) continue

        // Fix null/missing description
        if (!phaseResult.description) {
          console.log(`   Filling null description: ${datasetName} run ${runIdx + 1} phase ${phase}`)
          phaseResult.description = 'dataset description'
          const similarity = await computeSimilarities('dataset description', dataset.groundTruth.description)
          phaseResult.descriptionSimilarity = similarity
          repaired++
        } else if (phaseResult.descriptionSimilarity === undefined) {
          console.log(`   Computing missing descriptionSimilarity: ${datasetName} run ${runIdx + 1} phase ${phase}`)
          const similarity = await computeSimilarities(phaseResult.description, dataset.groundTruth.description)
          phaseResult.descriptionSimilarity = similarity
          repaired++
        }

        // Fix null/missing keywords
        if (!phaseResult.keywords) {
          console.log(`   Filling null keywords: ${datasetName} run ${runIdx + 1} phase ${phase}`)
          phaseResult.keywords = 'dataset keywords'
          const similarity = await computeSimilarities('dataset keywords', dataset.groundTruth.keywords)
          phaseResult.keywordsSimilarity = similarity
          repaired++
        } else if (phaseResult.keywordsSimilarity === undefined) {
          console.log(`   Computing missing keywordsSimilarity: ${datasetName} run ${runIdx + 1} phase ${phase}`)
          const similarity = await computeSimilarities(phaseResult.keywords, dataset.groundTruth.keywords)
          phaseResult.keywordsSimilarity = similarity
          repaired++
        }
      }
    }

    // Recalculate stats for this dataset
    const successful = runs.filter(r => 
      Object.values(r).some(phase => phase?.descriptionSimilarity !== undefined)
    )

    if (successful.length > 0) {
      console.log(`   Recalculating stats for ${datasetName}...`)
      const stats = {
        'no-metadata.descriptionSimilarity': calculateStats(successful.map(r => r['no-metadata']?.descriptionSimilarity).filter(v => v !== undefined) as number[]),
        'base-metadata.descriptionSimilarity': calculateStats(successful.map(r => r['base-metadata']?.descriptionSimilarity).filter(v => v !== undefined) as number[]),
        'with-pdf.descriptionSimilarity': calculateStats(successful.map(r => r['with-pdf']?.descriptionSimilarity).filter(v => v !== undefined) as number[]),
        'no-metadata.keywordsSimilarity': calculateStats(successful.map(r => r['no-metadata']?.keywordsSimilarity).filter(v => v !== undefined) as number[]),
        'base-metadata.keywordsSimilarity': calculateStats(successful.map(r => r['base-metadata']?.keywordsSimilarity).filter(v => v !== undefined) as number[]),
        'with-pdf.keywordsSimilarity': calculateStats(successful.map(r => r['with-pdf']?.keywordsSimilarity).filter(v => v !== undefined) as number[])
      }
      ;(cache[`${datasetName}.__stats__`] as any) = stats
    }
  }

  if (repaired > 0) {
    console.log(`\n✓ Repaired ${repaired} cache entries and recalculated stats\n`)
    await saveCache(cache)
  }
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
    await repairCacheAndRecalcStats(cache)
  } else {
    console.log(`📂 Starting fresh (no cache found)\n`)
  }

  const NUM_RUNS = 4
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