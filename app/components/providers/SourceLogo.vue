<template>
    <div class="max-h-6 min-h-4">
        <img v-if="props.type == 'Zenodo'" class="h-6" src="/logos/zenodo.svg" />
        <img v-else-if="props.type == 'HuggingFace'" class="h-6" src="/logos/huggingface.svg" />
        <img v-else-if="props.type == 'Kaggle'" class="h-6" src="/logos/kaggle.svg" />
        <img v-else-if="props.type == 'GitHub'" class="h-6" src="/logos/github.svg">
    </div>
</template>

<script lang="ts" setup>
const props = defineProps<{
    type: DataProvider
}>()
</script>

<style></style>