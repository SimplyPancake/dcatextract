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
        <Button label="Apply schema" severity="secondary" type="button" @click="saveSchemaText"
          :disabled="!schemaText.trim()" />
        <Button label="Clear schema" severity="secondary" type="button" @click="clearSchema" />
      </div>
      <Message v-if="schemaStatus === 'saved'" severity="success" class="mt-3">
        Schema stored. Matched {{ schemaAnalysis?.dcatKeys.length ?? 0 }} DCAT properties,
        {{ schemaAnalysis?.customProperties.length ?? 0 }} custom properties. Custom properties are derived by AI.
      </Message>
      <Message v-else-if="schemaStatus === 'warning'" severity="warn" class="mt-3">
        Schema stored, but no DCAT terms detected. Custom properties:
        {{ schemaAnalysis?.customProperties.length ?? 0 }}. Custom properties are derived by AI.
      </Message>
      <Message v-else-if="schemaStatus === 'error'" severity="error" class="mt-3">
        {{ schemaError || 'Failed to store schema.' }}
      </Message>
    </div>
    <div class="mt-4">
      <div v-if="schemaAnalysis" class="space-y-4">
        <div>
          <div class="text-sm font-medium">Matched DCAT properties</div>
          <div class="text-xs text-surface-500">Click tags to toggle.</div>
          <div v-if="matchedDcatKeys.length === 0" class="text-xs text-surface-500">
            No DCAT matches found.
          </div>
          <div v-else class="mt-2 flex flex-wrap gap-2">
            <button v-for="key in matchedDcatKeys" :key="key" type="button"
              class="flex min-h-11 flex-col items-start rounded-xl border px-3 py-2 text-left text-xs font-medium transition"
              :class="isSelected(key)
                ? 'border-sky-300 bg-sky-100 text-sky-900'
                : 'border-surface-200 bg-surface-0 text-surface-600 hover:bg-surface-50'"
              @click="toggleSelection(key)">
              <span class="text-[10px] uppercase tracking-wide opacity-70">{{ objectLabelForKey(key) }}</span>
              <span>{{ labelForKey(key) }}</span>
            </button>
          </div>
        </div>
        <div>
          <div class="text-sm font-medium">Unmatched DCAT properties</div>
          <div class="text-xs text-surface-500">Known DCAT terms not detected in this schema. You can still select them
            manually.</div>
          <div v-if="unmatchedDcatKeys.length === 0" class="text-xs text-surface-500">
            All DCAT properties are matched.
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
        <div>
          <div class="text-sm font-medium">Custom properties</div>
          <div v-if="schemaAnalysis.customProperties.length === 0" class="text-xs text-surface-500">
            No custom properties detected.
          </div>
          <div v-else class="mt-2 grid gap-2 sm:grid-cols-2">
            <div v-for="iri in schemaAnalysis.customProperties" :key="iri"
              class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <div class="text-xs font-semibold text-amber-900" :title="iri">
                    {{ formatIri(iri) }}
                  </div>
                  <div class="text-[11px] text-amber-700/80 break-all">
                    {{ iri }}
                  </div>
                </div>
                <button type="button"
                  class="rounded-full border border-amber-200 bg-white px-2 py-1 text-[10px] text-amber-700 hover:bg-amber-100"
                  @click="removeCustomProperty(iri)">
                  Remove
                </button>
              </div>
            </div>
            <div class="rounded-md border border-dashed border-amber-200 bg-white px-3 py-2">
              <div class="text-[11px] text-amber-700/80">Add custom property IRI</div>
              <div class="mt-2 flex gap-2">
                <InputText v-model="customPropertyDraft" class="w-full"
                  placeholder="https://example.org/terms/customField" />
                <Button label="Add" severity="secondary" type="button" @click="addCustomProperty"
                  :disabled="!customPropertyDraft.trim()" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="space-y-4">
        <div class="text-sm font-medium">All DCAT properties</div>
        <div v-for="group in treeNodes" :key="group.key" class="rounded-md border border-surface-200 p-3">
          <div class="text-sm font-medium">{{ group.label }}</div>
          <div class="mt-2 flex flex-wrap gap-2">
            <button v-for="child in group.children" :key="child.key" type="button"
              class="rounded-full border px-3 py-1 text-xs font-medium transition" :class="isSelected(child.key)
                ? 'border-sky-300 bg-sky-100 text-sky-900'
                : 'border-surface-200 bg-surface-0 text-surface-600 hover:bg-surface-50'"
              @click="toggleSelection(child.key)">
              {{ child.label }}
            </button>
          </div>
        </div>
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
  AlignLeft,
  Archive,
  ArrowLeftRight,
  Building2,
  Calendar,
  CheckCircle2,
  Clock3,
  Download,
  FileIcon,
  FileType,
  FolderTree,
  GitBranch,
  Globe,
  HardDrive,
  Hash,
  Info,
  Languages,
  Link2,
  Link2Icon,
  ListTree,
  Lock,
  Palette,
  Phone,
  Repeat,
  Ruler,
  Scale,
  Server,
  ShieldCheck,
  Tag,
  Type,
  User,
} from '@lucide/vue'
import type {
  CatalogRecordKey,
  DataServiceKey,
  DatasetKey,
  DistributionKey,
} from '#shared/utils/builder'
import type { SchemaAnalysis, SchemaStoreResponse } from '~~/shared/types/schema'

type OwnTreeNode = {
  key: string
  label: string
  children?: OwnTreeNode[]
  icon: any
  extra?: string
}

interface Dictionary<T> {
  [Key: string]: T
}

const selectedKeys = ref<Dictionary<boolean>>({})
const schemaText = ref('')
const schemaStatus = ref<'idle' | 'saving' | 'saved' | 'warning' | 'error'>('idle')
const schemaError = ref('')
const schemaAnalysis = ref<SchemaAnalysis | null>(null)
const schemaDirty = ref(false)
const customPropertyDraft = ref('')

const hasSelection = computed(() => {
  const hasDcat = Object.values(selectedKeys.value).some(Boolean)
  const hasCustom = (schemaAnalysis.value?.customProperties.length ?? 0) > 0
  return hasDcat || hasCustom
})

watch(schemaText, () => {
  schemaDirty.value = true
})

function toggleSelection(key: string) {
  const next = { ...selectedKeys.value }
  if (next[key]) {
    delete next[key]
  } else {
    next[key] = true
  }
  selectedKeys.value = next
}

function isSelected(key: string) {
  return !!selectedKeys.value[key]
}

const emit = defineEmits<{
  next: [schemas: Dictionary<boolean>]
}>()

function emitNext() {
  emit('next', { ...selectedKeys.value })
}

function applySchemaSelection(analysis: SchemaAnalysis | null) {
  if (!analysis) return
  const next = { ...selectedKeys.value }
  for (const key of analysis.dcatKeys) {
    next[key] = true
  }
  selectedKeys.value = next
}

const schemaPayload = ref<FormData | null>(null)
const { data: schemaResponse, execute: saveSchemaExecute } = useLazyFetch<SchemaStoreResponse>('/api/schema', {
  immediate: false,
  method: 'POST',
  body: schemaPayload
})

async function saveSchemaPayload(payload: FormData) {
  schemaStatus.value = 'saving'
  schemaError.value = ''
  try {
    schemaPayload.value = payload
    await saveSchemaExecute()
    const response = schemaResponse.value
    if (!response) {
      throw new Error('No schema response received')
    }
    if (response.stored && response.analysis) {
      schemaAnalysis.value = response.analysis
      applySchemaSelection(response.analysis)
      schemaStatus.value = response.analysis.usesDcat ? 'saved' : 'warning'
    } else {
      schemaAnalysis.value = null
      schemaStatus.value = 'idle'
    }
    schemaDirty.value = false
  } catch (err: any) {
    schemaStatus.value = 'error'
    schemaError.value = err?.message ?? 'Failed to store schema.'
  }
}

async function saveSchemaText() {
  const payload = new FormData()
  selectedKeys.value = {}
  payload.append('schemaText', schemaText.value)
  await saveSchemaPayload(payload)
}

async function saveCustomProperties(list: string[]) {
  const payload = new FormData()
  payload.append('customProperties', JSON.stringify(list))
  await saveSchemaPayload(payload)
}


async function clearSchema() {
  schemaText.value = ''
  selectedKeys.value = {}
  const payload = new FormData()
  payload.append('clear', '1')
  await saveSchemaPayload(payload)
}

async function addCustomProperty() {
  if (!schemaAnalysis.value) return
  const iri = customPropertyDraft.value.trim()
  if (!iri) return
  const next = [...new Set([...schemaAnalysis.value.customProperties, iri])]
  schemaAnalysis.value = { ...schemaAnalysis.value, customProperties: next }
  customPropertyDraft.value = ''
  await saveCustomProperties(next)
}

async function removeCustomProperty(iri: string) {
  if (!schemaAnalysis.value) return
  const next = schemaAnalysis.value.customProperties.filter(item => item !== iri)
  schemaAnalysis.value = { ...schemaAnalysis.value, customProperties: next }
  await saveCustomProperties(next)
}

const distributionKey = (key: DistributionKey) => `distribution.${key}`
const datasetKey = (key: DatasetKey) => `dataset.${key}`
const dataServiceKey = (key: DataServiceKey) => `dataService.${key}`
const catalogRecordKey = (key: CatalogRecordKey) => `catalogRecord.${key}`

const treeNodes = ref<OwnTreeNode[]>([
  {
    key: 'distribution',
    icon: FileIcon,
    label: 'Distribution',
    children: [
      { key: distributionKey('uri'), label: 'URI', icon: Link2 },

      { key: distributionKey('title'), label: 'Title', icon: Type },
      { key: distributionKey('description'), label: 'Description', icon: AlignLeft },

      { key: distributionKey('issued'), label: 'Issued', icon: Calendar },
      { key: distributionKey('modified'), label: 'Modified', icon: Calendar },

      { key: distributionKey('license'), label: 'License', icon: Scale },
      { key: distributionKey('rights'), label: 'Rights', icon: ShieldCheck },
      { key: distributionKey('conformsTo'), label: 'Conforms To', icon: CheckCircle2, extra: 'A standard or specification this distribution follows.' },

      { key: distributionKey('language'), label: 'Language', icon: Languages },

      { key: distributionKey('accessURL'), label: 'Access URL', icon: Globe },
      { key: distributionKey('downloadURL'), label: 'Download URL', icon: Download },
      { key: distributionKey('accessService'), label: 'Access Service', icon: Server, extra: 'A data service that provides access to this distribution.' },

      { key: distributionKey('format'), label: 'Format', icon: FileType },
      { key: distributionKey('mediaType'), label: 'Media Type', icon: FileType },
      { key: distributionKey('compressFormat'), label: 'Compress Format', icon: Archive },
      { key: distributionKey('packageFormat'), label: 'Package Format', icon: Archive },

      { key: distributionKey('byteSize'), label: 'Byte Size', icon: HardDrive },

      {
        key: distributionKey('spatialResolutionInMeters'),
        label: 'Spatial Resolution (Meters)',
        icon: Ruler,
      },

      {
        key: distributionKey('temporalResolution'),
        label: 'Temporal Resolution',
        icon: Clock3,
        extra: 'Time period covered by each observation (ISO 8601 duration).',
      },

      { key: distributionKey('spatial'), label: 'Spatial', icon: Ruler, extra: 'Geographic area covered by the distribution.' },
      { key: distributionKey('temporal'), label: 'Temporal', icon: Clock3, extra: 'Time period covered by the distribution.' },
    ],
  },

  {
    key: 'dataset',
    icon: FileIcon,
    label: 'Dataset',
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
      { key: datasetKey('wasAttributedTo'), label: 'Was Attributed To', icon: User, extra: 'Agent credited with creating or providing the dataset.' },
      { key: datasetKey('rightsHolder'), label: 'Rights Holder', icon: ShieldCheck, extra: 'Agent that owns or manages the dataset rights.' },

      { key: datasetKey('license'), label: 'License', icon: Scale },
      { key: datasetKey('rights'), label: 'Rights', icon: ShieldCheck },
      { key: datasetKey('accessRights'), label: 'Access Rights', icon: Lock, extra: 'Access level or restrictions (public, restricted, confidential).' },
      { key: datasetKey('conformsTo'), label: 'Conforms To', icon: CheckCircle2, extra: 'A standard or specification this dataset follows.' },
      { key: datasetKey('type'), label: 'Type', icon: Tag, extra: 'General category or nature of the dataset.' },

      { key: datasetKey('keyword'), label: 'Keyword', icon: Tag },
      { key: datasetKey('theme'), label: 'Theme', icon: Palette, extra: 'Topic category or taxonomy entry for the dataset.' },
      { key: datasetKey('contactPoint'), label: 'Contact Point', icon: Phone, extra: 'Who to contact for questions about the dataset.' },
      { key: datasetKey('landingPage'), label: 'Landing Page', icon: Globe },

      { key: datasetKey('version'), label: 'Version', icon: GitBranch },
      { key: datasetKey('versionNotes'), label: 'Version Notes', icon: AlignLeft },
      { key: datasetKey('hasVersion'), label: 'Has Version', icon: ArrowLeftRight, extra: 'Links to other versions of this dataset.' },
      { key: datasetKey('isVersionOf'), label: 'Is Version Of', icon: ArrowLeftRight, extra: 'The dataset this is a version of.' },
      { key: datasetKey('hasCurrentVersion'), label: 'Has Current Version', icon: ArrowLeftRight, extra: 'Points to the latest/current version.' },
      { key: datasetKey('previousVersion'), label: 'Previous Version', icon: ArrowLeftRight, extra: 'Version that came immediately before this one.' },
      { key: datasetKey('nextVersion'), label: 'Next Version', icon: ArrowLeftRight, extra: 'Version that comes immediately after this one.' },

      { key: datasetKey('qualifiedRelation'), label: 'Qualified Relation', icon: Link2Icon, extra: 'Relationship plus role information to another resource.' },
      { key: datasetKey('qualifiedAttribution'), label: 'Qualified Attribution', icon: Link2Icon, extra: 'Attribution with role (e.g., author, publisher).' },
      { key: datasetKey('inCatalog'), label: 'In Catalog', icon: ListTree, extra: 'Catalog where this dataset is listed.' },

      { key: datasetKey('distribution'), label: 'Distribution', icon: FileIcon, extra: 'Files or endpoints where the dataset is available.' },

      { key: datasetKey('spatial'), label: 'Spatial', icon: Ruler, extra: 'Geographic area covered by the dataset.' },
      { key: datasetKey('spatialResolutionInMeters'), label: 'Spatial Resolution (Meters)', icon: Ruler },
      { key: datasetKey('temporal'), label: 'Temporal', icon: Clock3, extra: 'Time period covered by the dataset.' },
      { key: datasetKey('temporalResolution'), label: 'Temporal Resolution', icon: Clock3, extra: 'Time period covered by each observation (ISO 8601 duration).' },
      { key: datasetKey('accrualPeriodicity'), label: 'Accrual Periodicity', icon: Repeat, extra: 'How often the dataset is updated.' },

      { key: datasetKey('inSeries'), label: 'In Series', icon: FolderTree, extra: 'Dataset series this dataset belongs to.' },
      { key: datasetKey('prev'), label: 'Previous', icon: ArrowLeftRight, extra: 'Previous dataset in the series.' },
      { key: datasetKey('next'), label: 'Next', icon: ArrowLeftRight, extra: 'Next dataset in the series.' },
      { key: datasetKey('first'), label: 'First', icon: ArrowLeftRight, extra: 'First dataset in the series.' },
      { key: datasetKey('last'), label: 'Last', icon: ArrowLeftRight, extra: 'Last dataset in the series.' },
    ],
  },

  {
    key: 'dataService',
    icon: Globe,
    label: 'Data Service',
    children: [
      { key: dataServiceKey('endpointURL'), label: 'Endpoint URL', icon: Link2 },
      { key: dataServiceKey('endpointDescription'), label: 'Endpoint Description', icon: AlignLeft, extra: 'Machine-readable description (e.g., OpenAPI).' },
      { key: dataServiceKey('servesDataset'), label: 'Serves Dataset', icon: FileIcon, extra: 'Datasets this service provides access to.' },
    ],
  },

  {
    key: 'catalogRecord',
    icon: FileIcon,
    label: 'Catalog Record',
    children: [
      { key: catalogRecordKey('uri'), label: 'URI', icon: Link2 },
      { key: catalogRecordKey('primaryTopic'), label: 'Primary Topic', icon: FileIcon, extra: 'The dataset or service this record describes.' },

      { key: catalogRecordKey('title'), label: 'Title', icon: Type },
      { key: catalogRecordKey('description'), label: 'Description', icon: AlignLeft },

      { key: catalogRecordKey('issued'), label: 'Issued', icon: Calendar },
      { key: catalogRecordKey('modified'), label: 'Modified', icon: Calendar },

      { key: catalogRecordKey('language'), label: 'Language', icon: Languages },
      { key: catalogRecordKey('conformsTo'), label: 'Conforms To', icon: CheckCircle2, extra: 'A standard or specification this record follows.' },
      { key: catalogRecordKey('status'), label: 'Status', icon: CheckCircle2, extra: 'Lifecycle status of the record (e.g., draft, published).' },
      { key: catalogRecordKey('source'), label: 'Source', icon: Link2Icon, extra: 'Source metadata record this was derived from.' },
    ],
  },
])

const labelByKey = computed(() => {
  const map: Record<string, string> = {}
  for (const group of treeNodes.value) {
    for (const child of group.children ?? []) {
      map[child.key] = child.label
    }
  }
  return map
})

const objectLabelByKey = computed(() => {
  const map: Record<string, string> = {}
  for (const group of treeNodes.value) {
    for (const child of group.children ?? []) {
      map[child.key] = group.label
    }
  }
  return map
})

const allDcatKeys = computed(() =>
  treeNodes.value.flatMap(group => group.children ?? []).map(child => child.key)
)

const manuallyMatchedDcatKeys = computed(() => {
  const schemaMatched = new Set(schemaAnalysis.value?.dcatKeys ?? [])
  return allDcatKeys.value.filter(key => !schemaMatched.has(key) && isSelected(key))
})

const matchedDcatKeys = computed(() => [
  ...(schemaAnalysis.value?.dcatKeys ?? []),
  ...manuallyMatchedDcatKeys.value,
])

const unmatchedDcatKeys = computed(() => {
  const matched = new Set(matchedDcatKeys.value)
  return allDcatKeys.value.filter(key => !matched.has(key))
})

function labelForKey(key: string) {
  return labelByKey.value[key] ?? key
}

function objectLabelForKey(key: string) {
  return objectLabelByKey.value[key] ?? key.split('.')[0] ?? 'Object'
}

const iriPrefixes: Record<string, string> = {
  dcat: 'http://www.w3.org/ns/dcat#',
  dcterms: 'http://purl.org/dc/terms/',
  prov: 'http://www.w3.org/ns/prov#',
  foaf: 'http://xmlns.com/foaf/0.1/',
  vcard: 'http://www.w3.org/2006/vcard/ns#'
}

function formatIri(iri: string) {
  for (const [prefix, base] of Object.entries(iriPrefixes)) {
    if (iri.startsWith(base)) {
      return `${prefix}:${iri.slice(base.length)}`
    }
  }
  const hashIndex = iri.lastIndexOf('#')
  const slashIndex = iri.lastIndexOf('/')
  const splitIndex = Math.max(hashIndex, slashIndex)
  return splitIndex >= 0 ? iri.slice(splitIndex + 1) : iri
}

async function loadPreset(path: string) {
  try {
    const text = await $fetch<string>(path, { responseType: 'text' })
    schemaText.value = text
    schemaDirty.value = true
    schemaStatus.value = 'idle'
    schemaError.value = ''
    schemaAnalysis.value = null
  } catch (err: any) {
    schemaStatus.value = 'error'
    schemaError.value = err?.message ?? 'Failed to load preset.'
  }
}

async function applyPresetDcat() {
  await loadPreset('/schemas/dcat.ttl')
}

async function applyPresetDcatAp() {
  await loadPreset('/schemas/dcat-ap.ttl')
}

const requestBody = computed(() => {
  const payload: Dictionary<boolean> = { ...selectedKeys.value }
  const hasDcat = Object.values(payload).some(Boolean)
  const hasCustom = (schemaAnalysis.value?.customProperties.length ?? 0) > 0
  if (!hasDcat && hasCustom) {
    payload.__customOnly = false
  }
  return { schemas: payload }
})

const { execute: startProcess } = useLazyFetch('/api/job/process/start', {
  immediate: false,
  method: 'POST',
  body: requestBody
})

async function startProcessing() {
  if (schemaDirty.value && schemaText.value.trim()) {
    await saveSchemaText()
  }
  await startProcess()
}

</script>

<style scoped>
.w-full {
  width: 100%;
}
</style>