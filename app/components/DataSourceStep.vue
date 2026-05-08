<template>
  <div class="flex flex-col">
    <Message v-if="unprocessedFilesCount > 0" severity="warn" class="mb-4">
      <div class="flex justify-between items-center">
        <span>You have {{ unprocessedFilesCount }} unprocessed files from a previous session.</span>
        <Button severity="contrast" variant="outlined" label="Process left-over files" class="ml-4" @click="emitNext" />
      </div>
    </Message>
    <Message v-if="isProcessing || runningJob" severity="info" class="mb-4">
      <div class="flex justify-between items-center">
        <span>Your session is currently processing data</span>
        <span v-if="runningJob"> (active job running)</span>
        <span v-else-if="isProcessing"> (files in processing queue)</span>
        <Button class="ml-4" severity="contrast" variant="outlined" label="Go to processing overview" @click="emitNext" />
      </div>
    </Message>
    <Message v-if="latestFinishedJob">
      <div class="flex justify-between items-center">
        <span>Your latest job has finished processing</span>
        <Button class="ml-4" severity="contrast" variant="outlined" label="Go to data overview" @click="gotoOverview()" />
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
        or other enterprise/government repositories via URL.
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
            Files will be stored as short as needed and will be attached to this session.
          </div>
          <ProgressBar class="my-2 h-2" v-if="progressBar != 0 && progressBar != 100"
            mode="indeterminate" :value="progressBar"></ProgressBar>
          <div class="flex flex-row">
            <div class="flex-auto">
              <FileUpload :disabled="uploadFinished" name="uploadedFiles" ref="fileUpload"
                mode="advanced" url="/api/upload" @select="uploadFinished = false"
                @upload="finishUpload" accept=".csv,.xml,.json,.pdf,.xlsx" :max-file-size="2e9"
                :multiple="true" @progress="progress" :pt="{
                  input: {
                    multiple: true
                  }
                }" />
            </div>
          </div>
          <Message class="mt-2" v-if="uploadFinished" severity="success">Upload finished!</Message>
        </div>
        <div v-else>
          <label class="mt-3 block text-xs font-medium" for="repo-url">Repository URL</label>
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
    <div class="flex pt-6 justify-end">
      <Button label="Next" :disabled="!mayContinue" @click="emitNext" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { DatabaseSearch, FileArchive, Loader2, Scan, Server, TriangleAlert } from '@lucide/vue'
import type { Job } from 'bullmq'
import { Button, Divider, Fieldset, FileUpload, InputGroup, InputGroupAddon, InputText, Message, ProgressBar, Tag } from 'primevue'
import { computed, ref } from 'vue'
import ProviderFeedback from '~/components/providers/ProviderFeedback.vue'
import SourceLogo from '~/components/providers/SourceLogo.vue'
import type { LatestJobDTO } from '~~/shared/types/dto'

const emit = defineEmits<{
  next: [],
  goto: [job: Job]
}>()

const { data: unprocessedData } = await useFetch('/api/unprocessed')
const { data: processingStatus } = await useFetch('/api/job/status')
const { data: latestFinishedJob } = await useFetch<LatestJobDTO>('/api/job/latest-completed')
const isProcessing = computed(() => processingStatus.value ?? false)
const runningJob = computed(() => processingStatus.value ?? false)
const unprocessedFilesCount = computed(() => unprocessedData.value?.unprocessedCount || 0)

const selectedSource = ref<'local' | 'repo' | null>(null)
const urlInput = ref('')
const requestBody = computed(() => ({ url: urlInput.value }))
const fileUpload = ref()
const progressBar = ref(0)
const uploadFinished = ref(false)

function progress(event: any) {
  progressBar.value = event.progress
}
function finishUpload() {
  uploadFinished.value = true
}

const { status, data: urlScanResult, error, execute } = useLazyFetch('/api/urlscan', {
  method: 'POST',
  body: requestBody,
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

function emitNext() {
  emit('next')
}

function gotoOverview() {
  emit('goto', latestFinishedJob.value as Job)
}
</script>

<style scoped></style>
