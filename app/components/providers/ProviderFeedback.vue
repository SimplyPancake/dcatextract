<template>
  <fieldset
    class="rounded-lg border px-4 py-3 transition-colors"
    :class="isSupported
      ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100'
      : 'border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100'">
    <legend class="px-2 text-xs font-semibold uppercase tracking-wide">
      {{ isSupported ? 'Provider supported' : headline }}
    </legend>
    <div class="flex items-center gap-3">
      <SourceLogo v-if="showLogo" :type="props.type" />
      <div class="text-sm">
        <p class="font-medium">{{ isSupported ? 'We support this provider.' : description }}</p>
        <p v-if="showIdentifier" class="mt-1 text-xs opacity-90">Dataset ID: {{ props.identifier }}</p>
        <p v-if="props.message && !isSupported" class="mt-1 text-xs opacity-90">{{ props.message }}</p>
      </div>
    </div>
  </fieldset>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import type { DataProvider } from '~~/shared/types/url'
import SourceLogo from '~/components/providers/SourceLogo.vue'

const props = defineProps<{
  type: DataProvider
  isError?: boolean
  errorKind?: 'unknown-provider' | 'invalid-url' | 'missing-identifier' | 'server'
  message?: string
  identifier?: string
}>()

const isSupported = computed(() => !props.isError && props.type !== 'Unknown')
const showLogo = computed(() => isSupported.value)
const showIdentifier = computed(() => isSupported.value && !!props.identifier)
const headline = computed(() => {
  if (!props.isError) return 'Provider not supported'
  switch (props.errorKind) {
    case 'invalid-url':
      return 'Invalid URL'
    case 'missing-identifier':
      return 'Unsupported URL format'
    case 'unknown-provider':
      return 'Provider not supported'
    default:
      return 'Could not scan provider'
  }
})

const description = computed(() => {
  if (!props.isError) return 'We cannot find a provider, or it is not supported.'
  switch (props.errorKind) {
    case 'invalid-url':
      return 'The URL is not valid or is missing a hostname.'
    case 'missing-identifier':
      return 'We recognized the provider but could not extract the dataset identifier.'
    case 'unknown-provider':
      return 'We do not support this provider yet.'
    default:
      return 'Something went wrong while checking the URL.'
  }
})
</script>

<style></style>