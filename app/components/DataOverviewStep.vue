<template>
  <div class="flex flex-row">
    <div class="basis-1/4">
      <Tree :value="nodes" class="p-0" selection-mode="single">
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
      {{ latestJob }}

    </div>
    <div class="basis-1/4">
      Validation warnings
    </div>
    <!-- TODO: Typed Jobs -->
    <!-- <DynamicForm v-if="latestJob" v-model="latestJob.returnvalue" /> -->
  </div>
</template>
<script lang="ts" setup>
import { FileText, FolderOpen, Folders, type LucideIcon } from '@lucide/vue';
import { Tag, Tree } from 'primevue';
import type { TreeNode } from 'primevue/treenode';
import { ref } from 'vue'
import type { LatestJobDTO } from '~~/shared/types/dto'
import type { FileProcessJob } from '~~/shared/types/workers';

defineEmits(['next'])

const props = defineProps<{
  latestJob?: LatestJobDTO
}>()

const latestJob = ref<LatestJobDTO>(props.latestJob)

if (!latestJob.value) {
  const { data } = await useFetch<LatestJobDTO>(
    '/api/job/process/latest-completed'
  )

  latestJob.value = data.value as FileProcessJob
}

const dataset = latestJob.value.returnvalue
const distributions = computed(() => {
  return dataset.distribution?.map(x => {
    return {
      key: x.title ?? crypto.randomUUID(),
      label: x.title,
      icon: FileText as any
    }
  })
})
const nodes = ref<TreeNode[]>([
  {
    key: '0',
    label: 'Distributions',
    data: { amount: distributions.value?.length ?? 0 },
    icon: FolderOpen as any,
    children: distributions.value
  },
  {
    key: '1',
    label: 'Dataset',
    icon: Folders as any,
  }
])

</script>

<style></style>