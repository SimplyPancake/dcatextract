<template>
  <fieldset
    class="rounded-lg border px-4 py-3 transition-colors"
    :class="isSupported
      ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100'
      : 'border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100'">
    <legend class="px-2 text-xs font-semibold uppercase tracking-wide">
      {{ isSupported ? 'Provider supported' : 'Provider not supported' }}
    </legend>
    <div class="flex items-center gap-3">
      <SourceLogo v-if="showLogo" :type="props.type" />
      <div class="text-sm">
        <p class="font-medium">{{ isSupported ? 'We support this provider.' : 'We cannot find a provider, or it is not supported.' }}</p>
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
  message?: string
}>()

const isSupported = computed(() => !props.isError && props.type !== 'Unknown')
const showLogo = computed(() => isSupported.value)
</script>

<style></style>