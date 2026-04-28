<template>
  <div
    class="min-h-screen bg-[radial-gradient(circle_at_top,_#e2e8f0_0%,_#f8fafc_38%,_#eef2ff_100%)] px-6 py-16 text-slate-900 dark:bg-[radial-gradient(circle_at_top,_#1e293b_0%,_#020617_48%,_#020617_100%)] dark:text-slate-50">
    <div class="mx-auto w-full max-w-5xl">
      <Hero />

      <main class="mx-auto mt-8 px-4">
        <section class="mx-auto max-w-3xl">
          <Card
            class="border border-white/60 bg-white/85 shadow-2xl shadow-slate-200/70 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/80 dark:shadow-black/30">
            <template #title>
              <div class="text-2xl font-semibold tracking-tight flex flex-row gap-2">Source type</div>
            </template>
            <template #content>
              <!-- <div class="space-y-4">
                <SelectButton v-model="sourceType" :options="so urceOptions" aria-label="Source type"
                  class="w-full sm:w-auto">
                  <template #option="slotProps">
                    <div class="flex items-center gap-3">
                      <SourceLogo :type="slotProps.option" />
                      <span class="text-sm font-medium">{{ slotProps.option }}</span>
                    </div>
                  </template>
</SelectButton>

<p class="text-sm text-slate-500 dark:text-slate-400">Selected source: <span
    class="font-medium text-slate-900 dark:text-slate-100">{{ sourceType }}</span></p>
</div>
</template> -->
              <Stepper value="1" linear>
                <StepList>
                  <Step value="1">Select data</Step>
                  <Step value="2">Data processing</Step>
                  <Step value="3">Complement data</Step>
                </StepList>
                <StepPanel v-slot="{ activateCallback }" value="1">
                  <div class="flex flex-col">
                    <div class="flex flex-row gap-4 w-full">
                      <Fieldset legend="Local Source"
                        class="w-1/2 cursor-pointer select-none transition-shadow duration-500 ease-out hover:shadow-lg hover:shadow-slate-300/40 dark:hover:shadow-black/40">
                        <Tag class="mb-2">
                          <FileArchive :size="35" />
                        </Tag> <br />
                        Upload a ZIP file containing your datasets for processing
                      </Fieldset>
                      <Fieldset legend="Data Repository"
                        class="w-1/2 cursor-pointer select-none transition-shadow duration-500 ease-out hover:shadow-lg hover:shadow-slate-300/40 dark:hover:shadow-black/40">
                        <Tag class="mb-2">
                          <Server :size="35" />
                        </Tag> <br />
                        Link to datasets from kaggle, Hugging Face, CKAN, GitHub, Zenodo, or other enterprise
                        repositories via URL.
                      </Fieldset>
                    </div>
                    <div>
                      <Divider class="py-4" />
                      <div class="h-20">
                        hallo
                      </div>
                    </div>
                  </div>
                  <div class="flex pt-6 justify-end">
                    <Button label="Next" icon="pi pi-arrow-right" @click="activateCallback('2')" />
                  </div>
                </StepPanel>
                <StepPanel v-slot="{ activateCallback }" value="2">
                  <div class="flex pt-6 justify-between">
                    <Button label="Back" severity="secondary" icon="pi pi-arrow-left" @click="activateCallback('1')" />
                    <Button label="Next" icon="pi pi-arrow-right" iconPos="right" @click="activateCallback('3')" />
                  </div>
                </StepPanel>
              </Stepper>
            </template>
          </Card>
        </section>
      </main>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { FileArchive, Server } from '@lucide/vue'
import { Card, Divider, Fieldset, Step, StepList, StepPanel, Stepper, Tag } from 'primevue'
import { ref } from 'vue'
import Hero from '~/components/Hero.vue'
import type { SourceType } from '~/components/SourceLogo.vue'

const sourceOptions: SourceType[] = ["CKAN", "Local", "HuggingFace"]
const sourceType = ref<string>(sourceOptions[0]!)

</script>

<style></style>