<template>
  <div class="flex flex-row p-4">
    <!-- TODO: Typed Jobs -->
    <DynamicForm v-if="latestJob" v-model="latestJob.returnvalue" />
  </div>
</template>
<script lang="ts" setup>
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
    '/api/job/latest-completed'
  )

  latestJob.value = data.value as FileProcessJob
}
</script>

<style>

</style>