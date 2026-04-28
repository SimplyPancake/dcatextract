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
                      <Fieldset legend="Local Source" role="button" tabindex="0" @click="selectedSource = 'local'"
                        @keydown.enter="selectedSource = 'local'" @keydown.space.prevent="selectedSource = 'local'"
                        :class="[
                          'w-1/2 cursor-pointer select-none transition-shadow duration-500 ease-out hover:shadow-lg hover:shadow-slate-300/40 dark:hover:shadow-black/40',
                          selectedSource === 'local' ? 'ring-2 ring-[var(--p-primary-color)] bg-sky-50/40 dark:bg-slate-800/50' : 'ring-1 ring-transparent'
                        ]">
                        <Tag class="mb-2">
                          <FileArchive :size="35" />
                        </Tag> <br />
                        Upload a ZIP file containing your datasets for processing
                      </Fieldset>
                      <Fieldset legend="Data Repository" role="button" tabindex="0" @click="selectedSource = 'repo'"
                        @keydown.enter="selectedSource = 'repo'" @keydown.space.prevent="selectedSource = 'repo'"
                        :class="[
                          'w-1/2 cursor-pointer select-none transition-shadow duration-500 ease-out hover:shadow-lg hover:shadow-slate-300/40 dark:hover:shadow-black/40',
                          selectedSource === 'repo' ? 'ring-2 ring-[var(--p-primary-color)] bg-sky-50/40 dark:bg-slate-800/50' : 'ring-1 ring-transparent'
                        ]">
                        <div class="flex flex-row">
                          <Tag class="mb-2">
                            <Server :size="35" />
                          </Tag>
                          <!-- <SourceLogo type="CKAN" />
                          <SourceLogo type="HuggingFace" />
                          <SourceLogo type="Kaggle" /> -->
                        </div>
                        Link to datasets from kaggle, Hugging Face, CKAN, GitHub, Zenodo,
                        or other
                        enterprise/government
                        repositories via URL.
                      </Fieldset>
                    </div>
                    <Transition enter-active-class="transition duration-300 ease-out"
                      enter-from-class="opacity-0 translate-y-2" enter-to-class="opacity-100 translate-y-0"
                      leave-active-class="transition duration-200 ease-in" leave-from-class="opacity-100 translate-y-0"
                      leave-to-class="opacity-0 -translate-y-1">
                      <div v-if="selectedSource">
                        <Divider class="pt-2" />
                        <div v-if="selectedSource === 'local'">
                          <div class="mb-2">
                            Files will be stored as short as needed and will be attached to this
                            session.
                          </div>
                          <!-- TODO: Detect zip bombs, no depth more than 5 will go -->
                          <FileUpload mode="basic" url="/api/upload" @upload="console.log($event)" :multiple="false"
                            accept=".zip,application/zip,application/x-zip-compressed" :max-file-size="2e9">
                          </FileUpload>
                        </div>
                        <div v-else>
                          <label class="mt-3 block text-xs font-medium" for="repo-url">Repository
                            URL</label>
                          <div class="flex flex-row">
                            <div class="w-10 bg-gray-200 rounded-sm">
                              <Loader2 />
                            </div>
                            <input id="repo-url" type="url" placeholder="https://example.com/dataset"
                              class="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200" />
                          </div>
                        </div>
                      </div>
                    </Transition>
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
import { FileArchive, Loader2, Server } from '@lucide/vue'
import { Card, Divider, Fieldset, FileUpload, Step, StepList, StepPanel, Stepper, Tag } from 'primevue'
import { ref } from 'vue'
import Hero from '~/components/Hero.vue'

const selectedSource = ref<'local' | 'repo' | null>(null)
const fileupload = ref();

</script>

<style></style>