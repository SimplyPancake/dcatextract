<template>
  <div
    class="min-h-screen bg-[radial-gradient(circle_at_top,_#e2e8f0_0%,_#f8fafc_38%,_#eef2ff_100%)] px-6 py-16 text-slate-900 dark:bg-[radial-gradient(circle_at_top,_#1e293b_0%,_#020617_48%,_#020617_100%)] dark:text-slate-50">
    <div class="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-4xl flex-col justify-center gap-8">
      <div class="max-w-2xl space-y-4">
        <p class="text-sm font-semibold uppercase tracking-[0.3em] text-sky-700 dark:text-sky-300">
          DCAT Extractor
        </p>
        <h1 class="text-4xl font-semibold tracking-tight sm:text-5xl">
          Extract DCAT schemas from popular sources
        </h1>
        <p class="max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300">
          Choose from a data repository, or upload your own data.
        </p>
      </div>

      <Card
        class="border border-white/60 bg-white/85 shadow-2xl shadow-slate-200/70 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/80 dark:shadow-black/30">
        <template #title>
          <div class="text-2xl font-semibold tracking-tight flex flex-row gap-2">
            Source type
          </div>
        </template>
        <template #content>
          <div class="space-y-4">
            <!-- <SelectButton v-model="sourceType" :options="sourceOptions" option-label="label" option-value="value"
              aria-label="Source type" class="w-full sm:w-auto" /> -->

            <SelectButton v-model="sourceType" :options="sourceOptions" aria-label="Source type" class="w-full sm:w-auto">
              <template #option="slotProps">
                <div class="flex flex-col">
                  <SourceLogo :type="slotProps.option" />
                  <div class="justify-end self-end self-end">
                    <!-- {{ slotProps.option }} -->
                  </div>
                </div>
              </template>
            </SelectButton>

            <p class="text-sm text-slate-500 dark:text-slate-400">
              Selected source: <span class="font-medium text-slate-900 dark:text-slate-100">{{ sourceType }}</span>
            </p>
          </div>
        </template>
      </Card>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import type { SourceType } from '~/components/SourceLogo.vue';

const sourceType = ref<'online' | 'local'>('online')

const sourceOptions: SourceType[] = ["CKAN", "Local", "HuggingFace"]

</script>

<style></style>