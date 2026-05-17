<!-- components/CustomPropertyAdder.vue -->
<template>
  <div class="rounded-md border border-dashed border-amber-200 bg-white px-3 py-2">
    <div class="text-[11px] text-amber-700/80 mb-2">Add custom property IRI</div>
    <div class="flex flex-wrap gap-2 items-center">
      <InputText v-model="iri" class="flex-1 min-w-48" placeholder="https://example.org/terms/myField" />
      <select v-model="context" class="h-9 rounded-md border border-surface-200 px-2 text-xs text-surface-700 bg-white">
        <option value="dataset">Dataset</option>
        <option value="distribution">Distribution</option>
        <option value="dataService">Data Service</option>
        <option value="catalogRecord">Catalog Record</option>
      </select>
      <Button label="Add" severity="secondary" type="button" @click="submit" :disabled="!iri.trim()" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'

type CustomPropertyContext = 'dataset' | 'distribution' | 'dataService' | 'catalogRecord'

const emit = defineEmits<{ add: [{ iri: string; context: CustomPropertyContext }] }>()

const iri = ref('')
const context = ref<CustomPropertyContext>('dataset')

function submit() {
  const trimmed = iri.value.trim()
  if (!trimmed) return
  emit('add', { iri: trimmed, context: context.value })
  iri.value = ''
}
</script>