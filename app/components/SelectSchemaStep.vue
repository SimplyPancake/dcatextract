<template>
  <div>
    <div class="pt-6">
      <div class="text-sm font-medium mb-3">Quick presets</div>
      <div class="grid gap-3 sm:grid-cols-2">
        <button type="button" @click="applyPresetDcat"
          class="flex items-center justify-between rounded-lg border-2 border-sky-200 bg-sky-50 px-4 py-3 text-left transition hover:bg-sky-100 hover:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-1">
          <div>
            <div class="font-medium text-sky-900">DCAT</div>
            <div class="text-xs text-sky-700">Data Catalog Vocabulary</div>
          </div>
          <div class="text-sky-400 text-lg">→</div>
        </button>
        <button type="button" @click="applyPresetDcatAp"
          class="flex items-center justify-between rounded-lg border-2 border-emerald-200 bg-emerald-50 px-4 py-3 text-left transition hover:bg-emerald-100 hover:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-1">
          <div>
            <div class="font-medium text-emerald-900">DCAT-AP</div>
            <div class="text-xs text-emerald-700">European Profile</div>
          </div>
          <div class="text-emerald-400 text-lg">→</div>
        </button>
      </div>
    </div>

    <div class="text-sm font-medium mb-2 mt-4">Metadata schema uploader</div>
    <div class="mt-0 rounded-lg border border-surface-200 bg-surface-0 p-4 shadow-sm">
      <div class="text-sm font-medium">Custom RDF/OWL schema (Turtle)</div>
      <div class="text-xs text-surface-500">Paste Turtle. DCAT terms will be auto-selected.</div>
      <Textarea v-model="schemaText" class="mt-3 w-full" rows="6"
        placeholder="@prefix dcat: <http://www.w3.org/ns/dcat#> ." />
      <div class="mt-3 flex flex-wrap gap-2 items-center">
        <Button label="Apply schema" severity="secondary" type="button" @click="applySchema"
          :disabled="!schemaText.trim()" />
        <Button label="Clear schema" severity="secondary" type="button" @click="clearSchema" />
      </div>
      <Message v-if="schemaStatus === 'saved'" severity="success" class="mt-3">
        Schema stored. Matched {{ schemaAnalysis?.dcatKeys.length ?? 0 }} DCAT properties,
        {{ customProperties.length }} custom properties.
      </Message>
      <Message v-else-if="schemaStatus === 'warning'" severity="warn" class="mt-3">
        Schema stored, but no DCAT terms detected. Custom properties: {{ customProperties.length }}.
      </Message>
      <Message v-else-if="schemaStatus === 'error'" severity="error" class="mt-3">
        {{ schemaError || 'Failed to store schema.' }}
      </Message>
    </div>

    <div class="mt-4 space-y-4">
      <template v-if="schemaAnalysis">
        <!-- Matched DCAT properties -->
        <div>
          <div class="text-sm font-medium">Matched DCAT properties</div>
          <div class="text-xs text-surface-500">Click tags to toggle.</div>
          <div v-if="matchedDcatKeys.length === 0" class="text-xs text-surface-500">No DCAT matches found.</div>
          <div v-else class="mt-2 flex flex-wrap gap-2">
            <button v-for="key in matchedDcatKeys" :key="key" type="button"
              class="flex min-h-11 flex-col items-start rounded-xl border px-3 py-2 text-left text-xs font-medium transition"
              :class="isSelected(key) ? 'border-sky-300 bg-sky-100 text-sky-900' : 'border-surface-200 bg-surface-0 text-surface-600 hover:bg-surface-50'"
              @click="toggleSelection(key)">
              <span class="text-[10px] uppercase tracking-wide opacity-70">{{ objectLabelForKey(key) }}</span>
              <span>{{ labelForKey(key) }}</span>
            </button>
          </div>
        </div>

        <!-- Unmatched DCAT properties -->
        <div v-if="unmatchedDcatKeys.length > 0">
          <div class="flex flex-row">
            <div class="flex-1">
              <div class="text-sm font-medium">Unmatched DCAT properties</div>
              <div class="text-xs text-surface-500">Known DCAT terms not detected in this schema. You can still select them
                manually.</div>
            </div>
            <div>
              <Button severity="secondary" size="small" @click="selectAllUnmatched()">Select all</Button>
            </div>
          </div>
          <div v-if="unmatchedDcatKeys.length === 0" class="text-xs text-surface-500">All DCAT properties are matched.
          </div>
          <div v-else class="mt-2 flex flex-wrap gap-2">
            <button v-for="key in unmatchedDcatKeys" :key="key" type="button"
              class="flex min-h-11 flex-col items-start rounded-xl border border-dashed px-3 py-2 text-left text-xs font-medium text-surface-500 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-900"
              @click="toggleSelection(key)">
              <span class="text-[10px] uppercase tracking-wide opacity-70">{{ objectLabelForKey(key) }}</span>
              <span>{{ labelForKey(key) }}</span>
            </button>
          </div>
        </div>
      </template>

      <template v-else>
        <!-- All DCAT properties (no schema loaded) -->
        <div class="text-sm font-medium">All DCAT properties</div>
        <div v-for="group in treeNodes" :key="group.key" class="rounded-md border border-surface-200 p-3">
          <div class="text-sm font-medium">{{ group.label }}</div>
          <div class="mt-2 flex flex-wrap gap-2">
            <button v-for="child in group.children" :key="child.key" type="button"
              class="rounded-full border px-3 py-1 text-xs font-medium transition"
              :class="isSelected(child.key) ? 'border-sky-300 bg-sky-100 text-sky-900' : 'border-surface-200 bg-surface-0 text-surface-600 hover:bg-surface-50'"
              @click="toggleSelection(child.key)">
              {{ child.label }}
            </button>
          </div>
        </div>
      </template>

      <!-- Custom properties (shown in both views) -->
      <div :class="schemaAnalysis ? '' : 'rounded-md border border-surface-200 p-3'">
        <div class="text-sm font-medium mb-1">Custom properties</div>
        <div class="text-xs text-surface-500 mb-3">Add non-DCAT properties and assign them a context.</div>
        <div v-if="customProperties.length > 0" class="grid gap-2 sm:grid-cols-2 mb-3">
          <div v-for="(prop, idx) in customProperties" :key="prop.iri" class="rounded-md border px-3 py-2"
            :class="contextBorderClass(prop.context)">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 flex-1">
                <div class="text-xs font-semibold" :class="contextTextClass(prop.context)" :title="prop.iri">
                  {{ formatIri(prop.iri) }}
                </div>
                <div class="text-[11px] break-all opacity-70" :class="contextTextClass(prop.context)">{{ prop.iri }}
                </div>
                <select :value="prop.context"
                  @change="updateContext(idx, ($event.target as HTMLSelectElement).value as CustomPropertyContext)"
                  class="mt-1.5 text-[11px] rounded border px-1.5 py-0.5 bg-white"
                  :class="contextBorderClass(prop.context)">
                  <option value="dataset">Dataset</option>
                  <option value="distribution">Distribution</option>
                  <option value="dataService">Data Service</option>
                  <option value="catalogRecord">Catalog Record</option>
                </select>
              </div>
              <button type="button" class="rounded-full border px-2 py-1 text-[10px] hover:opacity-80 shrink-0"
                :class="contextBorderClass(prop.context)" @click="removeCustomProperty(idx)">Remove</button>
            </div>
          </div>
        </div>
        <!-- Adder -->
        <div class="rounded-md border border-dashed border-amber-200 bg-white px-3 py-2">
          <div class="text-[11px] text-amber-700/80 mb-2">Add custom property IRI</div>
          <div class="flex flex-wrap gap-2 items-center">
            <InputText v-model="draft.iri" class="flex-1 min-w-48" placeholder="https://example.org/terms/myField" />
            <select v-model="draft.context"
              class="h-9 rounded-md border border-surface-200 px-2 text-xs text-surface-700 bg-white">
              <option value="dataset">Dataset</option>
              <option value="distribution">Distribution</option>
              <option value="dataService">Data Service</option>
              <option value="catalogRecord">Catalog Record</option>
            </select>
            <Button label="Add" severity="secondary" type="button" :disabled="!draft.iri.trim()"
              @click="addCustomProperty" />
          </div>
        </div>
      </div>
    </div>

    <!-- AI Confidence setting -->
    <Divider class="py-2" />
    <div class="text-sm font-medium mb-3">AI Inference</div>
    <div class="flex flex-row">
      <span class="basis-2/4 text-sm text-gray-400 dark:text-gray-300">Contextual (and custom) properties will be
        derived by an LLM. The LLM generates a confidence score per property.
      </span>
    </div>
    <div class="flex flex-row my-2 gap-4">
      <div class="flex-auto gap-4">
        <label for="percSlider font-bold">Minimum confidence score</label>
        <Slider inputId="percSlider" v-model="confidenceScore" class="flex-1 self-center" />
      </div>
      <div class="max-w-20">
        <InputNumber v-model.number="confidenceScore" suffix="%" fluid :min="0" :max="100" />
      </div>
    </div>

    <!-- Provider metadata toggle -->
    <Divider class="py-2" />
    <div class="text-sm font-medium mb-3">Provider-Supplied Metadata</div>
    <div class="flex flex-row items-center gap-4">
      <div class="flex-auto">
        <label for="useInheritedToggle" class="text-sm text-gray-700 dark:text-gray-300">
          Use metadata values from data provider schemas (if available)
        </label>
        <div class="text-xs text-surface-500 mt-1">
          When enabled, inherited values will be marked with "Inherited" strategy and skip LLM inference.
        </div>
      </div>
      <div class="shrink-0">
        <InputSwitch inputId="useInheritedToggle" v-model="useInheritedMetadata" />
      </div>
    </div>

    <div class="flex pt-6 justify-end">
      <Button label="Next" :disabled="!hasSelection" @click="startProcessing(); emitNext()" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Textarea from 'primevue/textarea'
import {
  AlignLeft, Archive, ArrowLeftRight, Building2, Calendar, CheckCircle2,
  Clock3, Download, FileIcon, FileType, FolderTree, GitBranch, Globe,
  HardDrive, Hash, Languages, Link2, Link2Icon, ListTree, Lock,
  Palette, Phone, Repeat, Ruler, Scale, Server, ShieldCheck, Tag, Type, User,
} from '@lucide/vue'
import type { CatalogRecordKey, DataServiceKey, DatasetKey, DistributionKey } from '#shared/utils/builder'
import type { CustomPropertyContext, SchemaAnalysis, SchemaStoreResponse } from '~~/shared/types/schema'
import { Divider, InputNumber, Slider, InputSwitch } from 'primevue'

type OwnTreeNode = { key: string; label: string; children?: OwnTreeNode[]; icon: any; extra?: string }
interface Dictionary<T> { [Key: string]: T }

// ─── State ────────────────────────────────────────────────────────────────────
const confidenceScore = ref(60)
const useInheritedMetadata = ref(true)
const selectedKeys = ref<Dictionary<boolean>>({})
const schemaText = ref('')
const schemaStatus = ref<'idle' | 'saving' | 'saved' | 'warning' | 'error'>('idle')
const schemaError = ref('')
const schemaAnalysis = ref<SchemaAnalysis | null>(null)
const schemaDirty = ref(false)

// Single list of custom properties regardless of whether a schema is loaded
const customProperties = ref<CustomProperty[]>([])
const draft = ref<CustomProperty>({ iri: '', context: 'dataset' })

// ─── Custom properties ────────────────────────────────────────────────────────

function addCustomProperty() {
  const iri = draft.value.iri.trim()
  if (!iri || customProperties.value.some(p => p.iri === iri)) return
  customProperties.value = [...customProperties.value, { iri, context: draft.value.context }]
  draft.value.iri = ''
  persistCustomProperties()
}

function removeCustomProperty(idx: number) {
  customProperties.value = customProperties.value.filter((_, i) => i !== idx)
  persistCustomProperties()
}

function updateContext(idx: number, context: CustomPropertyContext) {
  customProperties.value = customProperties.value.map((p, i) => i === idx ? { ...p, context } : p)
  persistCustomProperties()
}

// ─── Fetch: schema (text upload) ─────────────────────────────────────────────

const schemaPayload = ref<{ schemaText: string } | null>(null)
const { data: schemaResponse, execute: executeSchema } = useLazyFetch<SchemaStoreResponse>('/api/schema', {
  immediate: false, method: 'POST', body: schemaPayload,
})

async function applySchema() {
  schemaStatus.value = 'saving'
  schemaError.value = ''
  selectedKeys.value = {}
  try {
    schemaPayload.value = { schemaText: schemaText.value }
    await executeSchema()
    const res = schemaResponse.value
    if (!res?.stored || !res.analysis) throw new Error('No schema response received')
    schemaAnalysis.value = res.analysis
    // merge any custom properties the user added before uploading
    for (const p of res.analysis.customProperties) {
      if (!customProperties.value.some(m => m.iri === p.iri)) customProperties.value.push(p)
    }
    for (const key of res.analysis.dcatKeys) selectedKeys.value[key] = true
    schemaStatus.value = res.analysis.usesDcat ? 'saved' : 'warning'
    schemaDirty.value = false
  } catch (err: any) {
    schemaStatus.value = 'error'
    schemaError.value = err?.message ?? 'Failed to store schema.'
  }
}

function persistCustomProperties() {
  // Custom properties are client-side only now.
}

// ─── Clear ────────────────────────────────────────────────────────────────────

async function clearSchema() {
  schemaText.value = ''
  selectedKeys.value = {}
  schemaAnalysis.value = null
  customProperties.value = []
  schemaDirty.value = false
  schemaStatus.value = 'idle'
}

// ─── Presets ──────────────────────────────────────────────────────────────────

async function loadPreset(path: string) {
  try {
    schemaText.value = await $fetch<string>(path, { responseType: 'text' })
    schemaDirty.value = true
    schemaStatus.value = 'idle'
    schemaError.value = ''
    schemaAnalysis.value = null
  } catch (err: any) {
    schemaStatus.value = 'error'
    schemaError.value = err?.message ?? 'Failed to load preset.'
  }
}

async function applyPresetDcat() { await loadPreset('/schemas/dcat.ttl') }
async function applyPresetDcatAp() { await loadPreset('/schemas/dcat-ap.ttl') }

// ─── Processing ───────────────────────────────────────────────────────────────

const emit = defineEmits<{ next: [schemas: Dictionary<boolean>] }>()
function emitNext() { emit('next', { ...selectedKeys.value }) }

const processBody = ref<object>({})
const { execute: startProcess } = useLazyFetch('/api/job/process/start', {
  immediate: false, method: 'POST', body: processBody,
})

async function startProcessing() {
  if (schemaDirty.value && schemaText.value.trim()) await applySchema()
  processBody.value = {
    schemas: { ...selectedKeys.value },
    customProperties: customProperties.value,
    inferencePercentage: confidenceScore.value,
    useInheritedMetadata: useInheritedMetadata.value
  }
  await startProcess()
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const hasSelection = computed(() =>
  Object.values(selectedKeys.value).some(Boolean) || customProperties.value.length > 0
)

watch(schemaText, () => { schemaDirty.value = true })

function toggleSelection(key: string) {
  const next = { ...selectedKeys.value }
  if (next[key]) delete next[key]
  else next[key] = true
  selectedKeys.value = next
}

function isSelected(key: string) { return !!selectedKeys.value[key] }

const contextBorderClass = (ctx: CustomPropertyContext) => ({
  'border-blue-200 bg-blue-50': ctx === 'dataset',
  'border-green-200 bg-green-50': ctx === 'distribution',
  'border-amber-200 bg-amber-50': ctx === 'dataService',
  'border-purple-200 bg-purple-50': ctx === 'catalogRecord',
})

const contextTextClass = (ctx: CustomPropertyContext) => ({
  'text-blue-900': ctx === 'dataset',
  'text-green-900': ctx === 'distribution',
  'text-amber-900': ctx === 'dataService',
  'text-purple-900': ctx === 'catalogRecord',
})

const iriPrefixes: Record<string, string> = {
  dcat: 'http://www.w3.org/ns/dcat#',
  dcterms: 'http://purl.org/dc/terms/',
  prov: 'http://www.w3.org/ns/prov#',
  foaf: 'http://xmlns.com/foaf/0.1/',
  vcard: 'http://www.w3.org/2006/vcard/ns#',
}

function formatIri(iri: string) {
  for (const [prefix, base] of Object.entries(iriPrefixes))
    if (iri.startsWith(base)) return `${prefix}:${iri.slice(base.length)}`
  const i = Math.max(iri.lastIndexOf('#'), iri.lastIndexOf('/'))
  return i >= 0 ? iri.slice(i + 1) : iri
}

// ─── Tree ─────────────────────────────────────────────────────────────────────

const distributionKey = (key: DistributionKey) => `distribution.${key}`
const datasetKey = (key: DatasetKey) => `dataset.${key}`
const dataServiceKey = (key: DataServiceKey) => `dataService.${key}`
const catalogRecordKey = (key: CatalogRecordKey) => `catalogRecord.${key}`

const treeNodes = ref<OwnTreeNode[]>([
  {
    key: 'distribution', icon: FileIcon, label: 'Distribution',
    children: [
      { key: distributionKey('uri'), label: 'URI', icon: Link2 },
      { key: distributionKey('title'), label: 'Title', icon: Type },
      { key: distributionKey('description'), label: 'Description', icon: AlignLeft },
      { key: distributionKey('issued'), label: 'Issued', icon: Calendar },
      { key: distributionKey('modified'), label: 'Modified', icon: Calendar },
      { key: distributionKey('license'), label: 'License', icon: Scale },
      { key: distributionKey('rights'), label: 'Rights', icon: ShieldCheck },
      { key: distributionKey('conformsTo'), label: 'Conforms To', icon: CheckCircle2 },
      { key: distributionKey('language'), label: 'Language', icon: Languages },
      { key: distributionKey('accessURL'), label: 'Access URL', icon: Globe },
      { key: distributionKey('downloadURL'), label: 'Download URL', icon: Download },
      { key: distributionKey('accessService'), label: 'Access Service', icon: Server },
      { key: distributionKey('format'), label: 'Format', icon: FileType },
      { key: distributionKey('mediaType'), label: 'Media Type', icon: FileType },
      { key: distributionKey('compressFormat'), label: 'Compress Format', icon: Archive },
      { key: distributionKey('packageFormat'), label: 'Package Format', icon: Archive },
      { key: distributionKey('byteSize'), label: 'Byte Size', icon: HardDrive },
      { key: distributionKey('spatialResolutionInMeters'), label: 'Spatial Resolution (Meters)', icon: Ruler },
      { key: distributionKey('temporalResolution'), label: 'Temporal Resolution', icon: Clock3 },
      { key: distributionKey('spatial'), label: 'Spatial', icon: Ruler },
      { key: distributionKey('temporal'), label: 'Temporal', icon: Clock3 },
    ],
  },
  {
    key: 'dataset', icon: FileIcon, label: 'Dataset',
    children: [
      { key: datasetKey('uri'), label: 'URI', icon: Link2 },
      { key: datasetKey('title'), label: 'Title', icon: Type },
      { key: datasetKey('description'), label: 'Description', icon: AlignLeft },
      { key: datasetKey('identifier'), label: 'Identifier', icon: Hash },
      { key: datasetKey('issued'), label: 'Issued', icon: Calendar },
      { key: datasetKey('modified'), label: 'Modified', icon: Calendar },
      { key: datasetKey('language'), label: 'Language', icon: Languages },
      { key: datasetKey('publisher'), label: 'Publisher', icon: Building2 },
      { key: datasetKey('creator'), label: 'Creator', icon: User },
      { key: datasetKey('wasAttributedTo'), label: 'Was Attributed To', icon: User },
      { key: datasetKey('rightsHolder'), label: 'Rights Holder', icon: ShieldCheck },
      { key: datasetKey('license'), label: 'License', icon: Scale },
      { key: datasetKey('rights'), label: 'Rights', icon: ShieldCheck },
      { key: datasetKey('accessRights'), label: 'Access Rights', icon: Lock },
      { key: datasetKey('conformsTo'), label: 'Conforms To', icon: CheckCircle2 },
      { key: datasetKey('type'), label: 'Type', icon: Tag },
      { key: datasetKey('keyword'), label: 'Keyword', icon: Tag },
      { key: datasetKey('theme'), label: 'Theme', icon: Palette },
      { key: datasetKey('contactPoint'), label: 'Contact Point', icon: Phone },
      { key: datasetKey('landingPage'), label: 'Landing Page', icon: Globe },
      { key: datasetKey('version'), label: 'Version', icon: GitBranch },
      { key: datasetKey('versionNotes'), label: 'Version Notes', icon: AlignLeft },
      { key: datasetKey('hasVersion'), label: 'Has Version', icon: ArrowLeftRight },
      { key: datasetKey('isVersionOf'), label: 'Is Version Of', icon: ArrowLeftRight },
      { key: datasetKey('hasCurrentVersion'), label: 'Has Current Version', icon: ArrowLeftRight },
      { key: datasetKey('previousVersion'), label: 'Previous Version', icon: ArrowLeftRight },
      { key: datasetKey('nextVersion'), label: 'Next Version', icon: ArrowLeftRight },
      { key: datasetKey('qualifiedRelation'), label: 'Qualified Relation', icon: Link2Icon },
      { key: datasetKey('qualifiedAttribution'), label: 'Qualified Attribution', icon: Link2Icon },
      { key: datasetKey('inCatalog'), label: 'In Catalog', icon: ListTree },
      { key: datasetKey('distribution'), label: 'Distribution', icon: FileIcon },
      { key: datasetKey('spatial'), label: 'Spatial', icon: Ruler },
      { key: datasetKey('spatialResolutionInMeters'), label: 'Spatial Resolution (Meters)', icon: Ruler },
      { key: datasetKey('temporal'), label: 'Temporal', icon: Clock3 },
      { key: datasetKey('temporalResolution'), label: 'Temporal Resolution', icon: Clock3 },
      { key: datasetKey('accrualPeriodicity'), label: 'Accrual Periodicity', icon: Repeat },
      { key: datasetKey('inSeries'), label: 'In Series', icon: FolderTree },
      { key: datasetKey('prev'), label: 'Previous', icon: ArrowLeftRight },
      { key: datasetKey('next'), label: 'Next', icon: ArrowLeftRight },
      { key: datasetKey('first'), label: 'First', icon: ArrowLeftRight },
      { key: datasetKey('last'), label: 'Last', icon: ArrowLeftRight },
    ],
  },
  {
    key: 'dataService', icon: Globe, label: 'Data Service',
    children: [
      { key: dataServiceKey('endpointURL'), label: 'Endpoint URL', icon: Link2 },
      { key: dataServiceKey('endpointDescription'), label: 'Endpoint Description', icon: AlignLeft },
      { key: dataServiceKey('servesDataset'), label: 'Serves Dataset', icon: FileIcon },
    ],
  },
  {
    key: 'catalogRecord', icon: FileIcon, label: 'Catalog Record',
    children: [
      { key: catalogRecordKey('uri'), label: 'URI', icon: Link2 },
      { key: catalogRecordKey('primaryTopic'), label: 'Primary Topic', icon: FileIcon },
      { key: catalogRecordKey('title'), label: 'Title', icon: Type },
      { key: catalogRecordKey('description'), label: 'Description', icon: AlignLeft },
      { key: catalogRecordKey('issued'), label: 'Issued', icon: Calendar },
      { key: catalogRecordKey('modified'), label: 'Modified', icon: Calendar },
      { key: catalogRecordKey('language'), label: 'Language', icon: Languages },
      { key: catalogRecordKey('conformsTo'), label: 'Conforms To', icon: CheckCircle2 },
      { key: catalogRecordKey('status'), label: 'Status', icon: CheckCircle2 },
      { key: catalogRecordKey('source'), label: 'Source', icon: Link2Icon },
    ],
  },
])

const labelByKey = computed(() => {
  const map: Record<string, string> = {}
  for (const group of treeNodes.value)
    for (const child of group.children ?? []) map[child.key] = child.label
  return map
})

const objectLabelByKey = computed(() => {
  const map: Record<string, string> = {}
  for (const group of treeNodes.value)
    for (const child of group.children ?? []) map[child.key] = group.label
  return map
})

const allDcatKeys = computed(() =>
  treeNodes.value.flatMap(g => g.children ?? []).map(c => c.key)
)

const matchedDcatKeys = computed(() => {
  const schemaMatched = new Set(schemaAnalysis.value?.dcatKeys ?? [])
  const manual = allDcatKeys.value.filter(k => !schemaMatched.has(k) && isSelected(k))
  return [...(schemaAnalysis.value?.dcatKeys ?? []), ...manual]
})

const unmatchedDcatKeys = computed(() => {
  const matched = new Set(matchedDcatKeys.value)
  return allDcatKeys.value.filter(k => !matched.has(k))
})

function labelForKey(key: string) { return labelByKey.value[key] ?? key }
function objectLabelForKey(key: string) { return objectLabelByKey.value[key] ?? key.split('.')[0] ?? 'Object' }

function selectAllUnmatched() {
  selectedKeys.value = {
    ...selectedKeys.value,
    ...Object.fromEntries(unmatchedDcatKeys.value.map(key => [key, true]))
  }
}
</script>