<template>
  <div class="flex flex-row gap-2 items-start">
    <div 
      :class="[
        'shrink-0 transition-all duration-300 ease-in-out',
        isTreeVisible ? 'basis-1/5 opacity-100 translate-x-0' : 'basis-0 w-0 opacity-0 -translate-x-10 !gap-0 !p-0 m-0'
      ]"
      class=""
    >
      <Tree :value="nodes" class="p-0 min-w-[200px]" selection-mode="single" @node-select="onNodeSelect">
        <template #default="slotProps">
          <div class="flex flex-row gap-1">
            <component :is="(slotProps.node.icon as any as LucideIcon)"></component>
            <span class="truncate max-w-50">
              {{ slotProps.node.label }}
            </span>
          </div>
          <!-- <Tag v-if="slotProps.node.data.amount" severity="secondary">{{ slotProps.node.data.amount }}</Tag> -->
        </template>

      </Tree>
    </div>
    <div class="flex-1 flex flex-col gap-2 overflow-hidden">
      <div class="flex flex-row items-center gap-2">
        <Button text rounded severity="secondary" @click="isTreeVisible = !isTreeVisible" :aria-label="isTreeVisible ? 'Collapse panel' : 'Expand panel'">
          <PanelLeftClose v-if="isTreeVisible" :size="20" />
          <PanelLeft v-else :size="20" />
        </Button>
        <div class="text-xl font-bold">
          {{ selectedDataName }}
        </div>
        <div class="ml-auto flex items-center gap-2">
          <Button
            severity="secondary"
            :disabled="!latestJobResults"
            :loading="isExporting"
            @click="exportRdf"
          >
            <Download :size="16" class="mr-1" />
            Export RDF
          </Button>
        </div>
      </div>
      <div v-if="exportError" class="text-sm text-red-600">
        {{ exportError }}
      </div>
      <div v-if="selectedData">
        <SingleOverview :fields="selectedData" />
      </div>
      <span v-else class="w-full h-full text-center pt-8 text-lg text-gray-500">
        Open an item in the panel on the left to review generated results.
      </span>
    </div>
    <!-- <div class="basis-1/5">
      Validation warnings
    </div> -->
    <!-- TODO: Typed Jobs -->
    <!-- <DynamicForm v-if="latestJob" v-model="latestJob.returnvalue" /> -->
  </div>
  </template>
<script lang="ts" setup>
import { Database, FileText, FolderOpen, Folders, Server, PanelLeftClose, PanelLeft, type LucideIcon, Download } from '@lucide/vue';
import { Tree, Button } from 'primevue';
import type { TreeNode } from 'primevue/treenode';
import { ref, computed } from 'vue'
import type { LatestJobDTO } from '~~/shared/types/dto'
import type { ProcessedFields } from '~~/shared/types/workers';
import SingleOverview from './overview/SingleOverview.vue';
import { buildDcatTurtle } from '~~/shared/utils/dcat-export';

defineEmits(['next'])

const isTreeVisible = ref(true)

const props = defineProps<{
  latestJob?: LatestJobDTO
}>()

const latestJob = ref<LatestJobDTO | undefined>(props.latestJob)

if (!latestJob.value) {
  const { data: latestJobData } = await useFetch<LatestJobDTO>(
    '/api/job/process/latest-completed'
  )

  latestJob.value = latestJobData.value as LatestJobDTO
}

console.log(latestJob.value)

const latestJobData = computed(() => latestJob.value?.data)
const latestJobResults = computed(() => latestJob.value?.returnvalue)

const isExporting = ref(false)
const exportError = ref('')

const distributions = computed(() => {
  return latestJobData?.value?.filePaths.map((filename, idx) => {
    const originalName = latestJobData.value?.originalNames[filename]!
    return {
      key: `dist-${idx}`,
      label: originalName,
      icon: FileText as any
    }
  })
})

const selectedData = ref<ProcessedFields>()
const selectedDataName = ref("")

const onNodeSelect = (node: TreeNode) => {
  const nodeId = node.key
  if (nodeId.includes('-')) {
    // Distributions - index
    const index = parseInt(nodeId.split('-')[1]!)
    selectedData.value = latestJobResults.value?.distributions[index]!
    const filename = latestJobData?.value?.filePaths[index]!
    selectedDataName.value = capitaliseFirst(latestJobData.value?.originalNames[filename]!)
    return
  }

  // Dataset, or other
  selectedDataName.value = capitaliseFirst(nodes.value.find(x => x.key == nodeId)!.label!)
  if (nodeId == 'dataset') selectedData.value = latestJobResults.value?.dataset;
  if (nodeId == 'dataservice') selectedData.value = latestJobResults.value?.dataService;
  if (nodeId == 'catalogrecord') selectedData.value = latestJobResults.value?.catalogRecord;
};

const nodes = ref<TreeNode[]>([
  {
    key: 'distributions',
    label: 'Distributions',
    data: { amount: distributions.value?.length ?? 0 },
    icon: FolderOpen as any,
    children: distributions.value,
  },
  {
    key: 'dataset',
    label: 'Dataset',
    icon: Folders as any,
  },
  {
    key: 'dataservice',
    label: "Data Service",
    icon: Server as any
  },
  {
    key: 'catalogrecord',
    label: "Catalog Record",
    icon: Database as any
  }
])

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

async function exportRdf() {
  if (!latestJobResults.value) return
  if (typeof window === 'undefined') return

  exportError.value = ''
  isExporting.value = true

  try {
    const turtle = await buildDcatTurtle(latestJobResults.value)
    const datasetTitle = latestJobResults.value.dataset?.['dataset.title']?.result?.value
    const baseName = typeof datasetTitle === 'string' && datasetTitle.trim().length > 0
      ? slugify(datasetTitle)
      : 'dcat-export'

    const blob = new Blob([turtle], { type: 'text/turtle;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${baseName || 'dcat-export'}.ttl`
    link.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Failed to export RDF', error)
    exportError.value = 'Failed to export RDF. Please try again.'
  } finally {
    isExporting.value = false
  }
}

</script>

<style></style>