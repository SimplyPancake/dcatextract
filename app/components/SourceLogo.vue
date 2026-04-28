<template>
    <div class="w-10">
        <img v-if="props.type == 'CKAN'" src="/ckanlogo.svg" />
        <FileArchive v-else-if="props.type == 'Local'" />
        <img v-else-if="props.type == 'HuggingFace'" src="/hf-logo.svg" />
    </div>
</template>

<script lang="ts" setup>
import { FileArchive } from '@lucide/vue';

// TODO: Move this to .d.ts file
export type SourceType = "CKAN" | "Local" | "HuggingFace" | "Kaggle"

const props = defineProps<{
    type: SourceType
}>()
</script>

<style>

</style>