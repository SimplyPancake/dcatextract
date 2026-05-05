<template>
  <div class="min-h-screen bg-surface-ground px-6 py-16 text-slate-900 dark:text-slate-50">
    <div class="mx-auto w-full max-w-5xl">
      <Hero />

      <main class="mx-auto mt-8 px-4">
        <section class="mx-auto max-w-3xl">
          <Card
            class="border border-surface-200 bg-surface-card shadow-2xl shadow-slate-200/70 backdrop-blur dark:border-surface-700 dark:shadow-black/30">
            <template #title>
              <div class="text-2xl font-semibold tracking-tight flex flex-row gap-2">Source type</div>
            </template>
            <template #content>
              <Stepper value="1" linear>
                <StepList>
                  <Step value="1">Select data</Step>
                  <Step value="2">Data processing</Step>
                  <Step value="3">Complement data</Step>
                </StepList>
                <StepPanel v-slot="{ activateCallback }" value="1">
                  <div class="flex flex-col">
                    <Message v-if="unprocessedFilesCount > 0" severity="info" class="mb-4">
                      <div class="flex justify-between items-center">
                        <span class="">You have {{ unprocessedFilesCount }} unprocessed files from a previous session.</span>
                        <Button severity="info" variant="outlined" label="Process left-over files" class="ml-4" @click="activateCallback('2'); startProcess()" />
                      </div>
                    </Message>
                    <div class="flex flex-row gap-4 w-full">
                      <Fieldset legend="Local Source" role="button" tabindex="0" @click="selectedSource = 'local'"
                        :class="[
                          'w-1/2 cursor-pointer select-none transition-shadow duration-500 ease-out hover:shadow-lg hover:shadow-slate-300/40 dark:hover:shadow-black/40',
                          selectedSource === 'local' ? 'ring-2 ring-[var(--p-primary-color)] bg-sky-50/40 dark:bg-slate-800/50' : 'ring-1 ring-transparent'
                        ]">
                        <Tag class="mb-2">
                          <FileArchive :size="35" />
                        </Tag> <br />
                        Upload a folder with files to process.
                      </Fieldset>
                      <Fieldset legend="Data Repository" role="button" tabindex="0" @click="selectedSource = 'repo'"
                        :class="[
                          'w-1/2 cursor-pointer select-none transition-shadow duration-500 ease-out hover:shadow-lg hover:shadow-slate-300/40 dark:hover:shadow-black/40',
                          selectedSource === 'repo' ? 'ring-2 ring-[var(--p-primary-color)] bg-sky-50/40 dark:bg-slate-800/50' : 'ring-1 ring-transparent'
                        ]">
                        <div class="flex flex-row">
                          <Tag class="mb-2">
                            <Server :size="35" />
                          </Tag>
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
                          <ProgressBar class="my-2 h-2" v-if="progressBar != 0 && progressBar != 100"
                            mode="indeterminate" :value="progressBar"></ProgressBar>
                          <div class="flex flex-row">
                            <div class="flex-auto">
                              <FileUpload :disabled="uploadFinished" name="uploadedFiles" ref="fileUpload"
                                mode="advanced" url="/api/upload" @select="uploadFinished = false"
                                @upload="finishUpload()" accept=".csv,.xml,.json,.pdf,.xlsx" :max-file-size="2e9"
                                :multiple="true" @progress="progress($event)" :pt="{
                                  input: {
                                    // directory: true,
                                    // webkitdirectory: true,
                                    multiple: true
                                  }
                                }" />
                            </div>
                            <!-- <Button class="ml-2" :disabled="uploadFinished" label="Upload" severity="secondary" @click="upload()"></Button> -->
                          </div>
                          <Message class="mt-2" v-if="uploadFinished" severity="success">Upload finished!</Message>
                        </div>
                        <div v-else>
                          <label class="mt-3 block text-xs font-medium" for="repo-url">Repository
                            URL</label>
                          <div class="flex flex-row">
                            <InputGroup>
                              <InputGroupAddon>
                                <Scan v-if="status == 'idle'" />
                                <Loader2 v-else-if="status == 'pending'" class="animate-spin" />
                                <TriangleAlert v-else-if="status == 'error'" />
                                <SourceLogo v-else-if="status == 'success'" :type="urlScanResult?.sourceType!" />
                              </InputGroupAddon>
                              <InputText v-model="urlInput" placeholder="https://example.com/dataset" type="url" />
                              <InputGroupAddon>
                                <Button @click="execute()" severity="secondary">
                                  Search
                                  <DatabaseSearch />
                                </Button>
                              </InputGroupAddon>
                            </InputGroup>
                          </div>
                          <ProviderFeedback v-if="showProviderFeedback" class="mt-3" :type="feedbackProvider"
                            :is-error="status === 'error'" :message="feedbackErrorMessage" />
                        </div>
                      </div>
                    </Transition>
                  </div>
                  <div class="flex pt-6 justify-end">
                    <Button label="Next" :disabled="!mayContinue" @click="activateCallback('2'); startProcess();" />
                  </div>
                </StepPanel>
                <StepPanel v-slot="{ activateCallback }" value="2">
                  <div class="flex pt-6 justify-end">
                    <!-- <Button label="Back" :di severity="secondary" @click="activateCallback('1')" /> -->
                    <Button label="Next" @click="activateCallback('3')" :disabled="true" />
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
import { DatabaseSearch, FileArchive, Loader2, Scan, Server, TriangleAlert } from '@lucide/vue'
import { Button, Card, Divider, Fieldset, FileUpload, InputGroup, Message, Step, StepList, StepPanel, Stepper, Tag, type FileUploadProgressEvent } from 'primevue'
import { computed, ref } from 'vue'
import Hero from '~/components/Hero.vue'
import ProviderFeedback from '~/components/providers/ProviderFeedback.vue'
import SourceLogo from '~/components/providers/SourceLogo.vue'

const selectedSource = ref<'local' | 'repo' | null>(null)

const stepper = ref()
const { data: unprocessedData } = useFetch('/api/unprocessed')
const unprocessedFilesCount = computed(() => unprocessedData.value?.unprocessedCount || 0)

const urlInput = ref('')
const requestBody = computed(() => ({
  url: urlInput.value
}))

const fileUpload = ref();
const upload = () => {
  fileUpload.value?.upload();
};
const progressBar = ref(0)

function progress(event: FileUploadProgressEvent) {
  progressBar.value = event.progress
}

const uploadFinished = ref(false)
function finishUpload() {
  uploadFinished.value = true
}

const { status, data: urlScanResult, error, execute } = useLazyFetch('/api/urlscan', {
  method: "POST",
  body: requestBody,
  immediate: false
});

const { execute: startProcess } = useLazyFetch('/api/startprocess', {
  immediate: false
})

const showProviderFeedback = computed(() => status.value === 'success' || status.value === 'error')
const feedbackProvider = computed(() => urlScanResult.value?.sourceType ?? 'Unknown')
const feedbackErrorMessage = computed(() => {
  const data = (error.value as { data?: { message?: string; statusMessage?: string } } | null)?.data
  return data?.message || data?.statusMessage || error.value?.message
})

const mayContinue = computed(() => (selectedSource.value == 'local' && uploadFinished.value)
  ||
  (
    selectedSource.value == 'repo' &&
    status.value == 'success' && feedbackProvider.value != 'Unknown'
  ))

onMounted(() => {
  console.log(fileUpload.value)
})
</script>

<style></style>