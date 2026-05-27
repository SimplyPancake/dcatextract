<template>
  <div class="flex flex-row">
    <div class="basis-1/4">
      <Tree :value="nodes" class="p-0" selection-mode="single" @node-select="onNodeSelect">
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
    <div class="basis-2/4">
      <SingleOverview v-if="selectedData" :fields="selectedData" />
    </div>
    <div class="basis-1/4">
      Validation warnings
    </div>
    <!-- TODO: Typed Jobs -->
    <!-- <DynamicForm v-if="latestJob" v-model="latestJob.returnvalue" /> -->
  </div>
</template>
<script lang="ts" setup>
import { Database, FileText, FolderOpen, Folders, Server, type LucideIcon } from '@lucide/vue';
import { Tag, Tree } from 'primevue';
import type { TreeNode } from 'primevue/treenode';
import { ref, computed } from 'vue'
import type { LatestJobDTO } from '~~/shared/types/dto'
import type { DistributionContextProcessedFields, ProcessedFields } from '~~/shared/types/workers';
import SingleOverview from './overview/SingleOverview.vue';

defineEmits(['next'])

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

const selectedData = ref<ProcessedFields | DistributionContextProcessedFields>()

const onNodeSelect = (node: TreeNode) => {
  const nodeId = node.key
  if (nodeId.includes('-')) {
    // Distributions - index
    const index = parseInt(nodeId.split('-')[1]!)
    selectedData.value = latestJobResults.value?.distributions[index]!
    return
  }

  // Dataset, or other
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

</script>

<style></style>