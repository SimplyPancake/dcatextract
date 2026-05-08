<template>
  <div>
    <div class="flex flex-row flex-wrap gap-2 pt-4">
      <Button label="Select all" severity="secondary" @click="selectAll" />
      <Button label="Deselect all" severity="secondary" @click="deselectAll" />
    </div>
    <Tree
      :value="treeNodes"
      class="w-lg"
      selectionMode="multiple"
      :selectionKeys="selectedKeys"
      @update:selectionKeys="onSelectionKeysUpdate"
      @node-select="onNodeSelect"
      @node-unselect="onNodeUnselect"
    >
      <template #default="slotProps">
        <div class="flex flex-row gap-2">
          <component :is="slotProps.node.icon"></component>
          {{ slotProps.node.label }}
          <Info v-if="slotProps.node.extra" v-tooltip="slotProps.node.extra" />
        </div>
      </template>
    </Tree>
    {{ selectedKeys }}
    <div class="flex pt-6 justify-end">
      <Button label="Next" :disabled="!hasSelection" @click="startProcessing(); emitNext()" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue'
import Tree from 'primevue/tree'
import Button from 'primevue/button'
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
import type { TreeNode } from 'primevue/treenode'

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

function collectChildKeys(node: TreeNode, target: Dictionary<boolean>) {
  if (!node.children?.length) return

  for (const child of node.children) {
    target[child.key] = true
    collectChildKeys(child, target)
  }
}

function removeChildKeys(node: TreeNode, target: Dictionary<boolean>) {
  if (!node.children?.length) return

  for (const child of node.children) {
    delete target[child.key]
    removeChildKeys(child, target)
  }
}

function collectAllKeys(nodes: OwnTreeNode[], target: Dictionary<boolean>) {
  for (const node of nodes) {
    target[node.key] = true
    if (node.children?.length) {
      collectAllKeys(node.children, target)
    }
  }
}

const pendingParent = ref<TreeNode | null>(null)
const pendingUnselect = ref<TreeNode | null>(null)

function onNodeSelect(event: TreeNode | { node: TreeNode }) {
  pendingParent.value = 'node' in event ? event.node : event
}

function onNodeUnselect(event: TreeNode | { node: TreeNode }) {
  pendingUnselect.value = 'node' in event ? event.node : event
}

const selectedKeys = ref<Dictionary<boolean>>({})
const hasSelection = computed(() => Object.values(selectedKeys.value).some(Boolean))

function onSelectionKeysUpdate(value: Dictionary<boolean>) {
  const next = { ...value }

  if (pendingParent.value) {
    collectChildKeys(pendingParent.value, next)
    pendingParent.value = null
  }

  if (pendingUnselect.value) {
    removeChildKeys(pendingUnselect.value, next)
    pendingUnselect.value = null
  }

  selectedKeys.value = next
}

const emit = defineEmits<{
  next: [schemas: Dictionary<boolean>]
}>()

function emitNext() {
  emit('next', { ...selectedKeys.value })
}

const treeNodes = ref<OwnTreeNode[]>([
  {
    key: 'distribution',
    icon: FileIcon,
    label: 'Distribution',
    children: [
      { key: 'distribution.uri', label: 'URI', icon: Link2 },

      { key: 'distribution.title', label: 'Title', icon: Type },
      { key: 'distribution.description', label: 'Description', icon: AlignLeft },

      { key: 'distribution.issued', label: 'Issued', icon: Calendar },
      { key: 'distribution.modified', label: 'Modified', icon: Calendar },

      { key: 'distribution.license', label: 'License', icon: Scale },
      { key: 'distribution.rights', label: 'Rights', icon: ShieldCheck },
      { key: 'distribution.conformsTo', label: 'Conforms To', icon: CheckCircle2, extra: 'A standard or specification this distribution follows.' },

      { key: 'distribution.language', label: 'Language', icon: Languages },

      { key: 'distribution.accessURL', label: 'Access URL', icon: Globe },
      { key: 'distribution.downloadURL', label: 'Download URL', icon: Download },
      { key: 'distribution.accessService', label: 'Access Service', icon: Server, extra: 'A data service that provides access to this distribution.' },

      { key: 'distribution.format', label: 'Format', icon: FileType },
      { key: 'distribution.mediaType', label: 'Media Type', icon: FileType },
      { key: 'distribution.compressFormat', label: 'Compress Format', icon: Archive },
      { key: 'distribution.packageFormat', label: 'Package Format', icon: Archive },

      { key: 'distribution.byteSize', label: 'Byte Size', icon: HardDrive },

      {
        key: 'distribution.spatialResolutionInMeters',
        label: 'Spatial Resolution (Meters)',
        icon: Ruler,
      },

      {
        key: 'distribution.temporalResolution',
        label: 'Temporal Resolution',
        icon: Clock3,
        extra: 'Time period covered by each observation (ISO 8601 duration).',
      },

      { key: 'distribution.spatial', label: 'Spatial', icon: Ruler, extra: 'Geographic area covered by the distribution.' },
      { key: 'distribution.temporal', label: 'Temporal', icon: Clock3, extra: 'Time period covered by the distribution.' },
    ],
  },

  {
    key: 'dataset',
    icon: FileIcon,
    label: 'Dataset',
    children: [
      { key: 'dataset.uri', label: 'URI', icon: Link2 },

      { key: 'dataset.title', label: 'Title', icon: Type },
      { key: 'dataset.description', label: 'Description', icon: AlignLeft },
      { key: 'dataset.identifier', label: 'Identifier', icon: Hash },

      { key: 'dataset.issued', label: 'Issued', icon: Calendar },
      { key: 'dataset.modified', label: 'Modified', icon: Calendar },

      { key: 'dataset.language', label: 'Language', icon: Languages },
      { key: 'dataset.publisher', label: 'Publisher', icon: Building2 },
      { key: 'dataset.creator', label: 'Creator', icon: User },
      { key: 'dataset.wasAttributedTo', label: 'Was Attributed To', icon: User, extra: 'Agent credited with creating or providing the dataset.' },
      { key: 'dataset.rightsHolder', label: 'Rights Holder', icon: ShieldCheck, extra: 'Agent that owns or manages the dataset rights.' },

      { key: 'dataset.license', label: 'License', icon: Scale },
      { key: 'dataset.rights', label: 'Rights', icon: ShieldCheck },
      { key: 'dataset.accessRights', label: 'Access Rights', icon: Lock, extra: 'Access level or restrictions (public, restricted, confidential).' },
      { key: 'dataset.conformsTo', label: 'Conforms To', icon: CheckCircle2, extra: 'A standard or specification this dataset follows.' },
      { key: 'dataset.type', label: 'Type', icon: Tag, extra: 'General category or nature of the dataset.' },

      { key: 'dataset.keyword', label: 'Keyword', icon: Tag },
      { key: 'dataset.theme', label: 'Theme', icon: Palette, extra: 'Topic category or taxonomy entry for the dataset.' },
      { key: 'dataset.contactPoint', label: 'Contact Point', icon: Phone, extra: 'Who to contact for questions about the dataset.' },
      { key: 'dataset.landingPage', label: 'Landing Page', icon: Globe },

      { key: 'dataset.version', label: 'Version', icon: GitBranch },
      { key: 'dataset.versionNotes', label: 'Version Notes', icon: AlignLeft },
      { key: 'dataset.hasVersion', label: 'Has Version', icon: ArrowLeftRight, extra: 'Links to other versions of this dataset.' },
      { key: 'dataset.isVersionOf', label: 'Is Version Of', icon: ArrowLeftRight, extra: 'The dataset this is a version of.' },
      { key: 'dataset.hasCurrentVersion', label: 'Has Current Version', icon: ArrowLeftRight, extra: 'Points to the latest/current version.' },
      { key: 'dataset.previousVersion', label: 'Previous Version', icon: ArrowLeftRight, extra: 'Version that came immediately before this one.' },
      { key: 'dataset.nextVersion', label: 'Next Version', icon: ArrowLeftRight, extra: 'Version that comes immediately after this one.' },

      { key: 'dataset.qualifiedRelation', label: 'Qualified Relation', icon: Link2Icon, extra: 'Relationship plus role information to another resource.' },
      { key: 'dataset.qualifiedAttribution', label: 'Qualified Attribution', icon: Link2Icon, extra: 'Attribution with role (e.g., author, publisher).' },
      { key: 'dataset.inCatalog', label: 'In Catalog', icon: ListTree, extra: 'Catalog where this dataset is listed.' },

      { key: 'dataset.distribution', label: 'Distribution', icon: FileIcon, extra: 'Files or endpoints where the dataset is available.' },

      { key: 'dataset.spatial', label: 'Spatial', icon: Ruler, extra: 'Geographic area covered by the dataset.' },
      { key: 'dataset.spatialResolutionInMeters', label: 'Spatial Resolution (Meters)', icon: Ruler },
      { key: 'dataset.temporal', label: 'Temporal', icon: Clock3, extra: 'Time period covered by the dataset.' },
      { key: 'dataset.temporalResolution', label: 'Temporal Resolution', icon: Clock3, extra: 'Time period covered by each observation (ISO 8601 duration).' },
      { key: 'dataset.accrualPeriodicity', label: 'Accrual Periodicity', icon: Repeat, extra: 'How often the dataset is updated.' },

      { key: 'dataset.inSeries', label: 'In Series', icon: FolderTree, extra: 'Dataset series this dataset belongs to.' },
      { key: 'dataset.prev', label: 'Previous', icon: ArrowLeftRight, extra: 'Previous dataset in the series.' },
      { key: 'dataset.next', label: 'Next', icon: ArrowLeftRight, extra: 'Next dataset in the series.' },
      { key: 'dataset.first', label: 'First', icon: ArrowLeftRight, extra: 'First dataset in the series.' },
      { key: 'dataset.last', label: 'Last', icon: ArrowLeftRight, extra: 'Last dataset in the series.' },
    ],
  },

  {
    key: 'dataService',
    icon: Globe,
    label: 'Data Service',
    children: [
      { key: 'dataService.endpointURL', label: 'Endpoint URL', icon: Link2 },
      { key: 'dataService.endpointDescription', label: 'Endpoint Description', icon: AlignLeft, extra: 'Machine-readable description (e.g., OpenAPI).' },
      { key: 'dataService.servesDataset', label: 'Serves Dataset', icon: FileIcon, extra: 'Datasets this service provides access to.' },
    ],
  },

  {
    key: 'catalogRecord',
    icon: FileIcon,
    label: 'Catalog Record',
    children: [
      { key: 'catalogRecord.uri', label: 'URI', icon: Link2 },
      { key: 'catalogRecord.primaryTopic', label: 'Primary Topic', icon: FileIcon, extra: 'The dataset or service this record describes.' },

      { key: 'catalogRecord.title', label: 'Title', icon: Type },
      { key: 'catalogRecord.description', label: 'Description', icon: AlignLeft },

      { key: 'catalogRecord.issued', label: 'Issued', icon: Calendar },
      { key: 'catalogRecord.modified', label: 'Modified', icon: Calendar },

      { key: 'catalogRecord.language', label: 'Language', icon: Languages },
      { key: 'catalogRecord.conformsTo', label: 'Conforms To', icon: CheckCircle2, extra: 'A standard or specification this record follows.' },
      { key: 'catalogRecord.status', label: 'Status', icon: CheckCircle2, extra: 'Lifecycle status of the record (e.g., draft, published).' },
      { key: 'catalogRecord.source', label: 'Source', icon: Link2Icon, extra: 'Source metadata record this was derived from.' },
    ],
  },
])

function selectAll() {
  const next: Dictionary<boolean> = {}
  collectAllKeys(treeNodes.value, next)
  selectedKeys.value = next
}

function deselectAll() {
  selectedKeys.value = {}
}

const { execute: startProcess } = useLazyFetch('/api/job/start', {
  immediate: false,
  method: 'POST',
  body: computed(() => ({ schemas: selectedKeys.value }))
})

async function startProcessing() {
  await startProcess()
}

</script>

<style scoped>
.w-full {
  width: 100%;
}
</style>