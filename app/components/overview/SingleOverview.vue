<template>
  <div>
    {{ props.fields }}
  </div>
</template>

<script lang="ts" setup>
import type { DistributionContextProcessedFields, ProcessedFields } from '~~/shared/types/workers';

const props = defineProps<{
  fields: ProcessedFields | DistributionContextProcessedFields
}>()
</script>

<style>

</style>