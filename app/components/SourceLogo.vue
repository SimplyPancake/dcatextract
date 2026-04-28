<template>
    <div class="w-10">
        <img v-if="props.type == 'CKAN'" src="/logos/ckan.svg" />
        <img v-else-if="props.type == 'HuggingFace'" src="/logos/huggingface.svg" />
        <img v-else-if="props.type == 'Kaggle'" src="/logos/kaggle.svg" />
    </div>
</template>

<script lang="ts" setup>
const props = defineProps<{
    type: URLSourceType
}>()
</script>

<style></style>