<template>
  <div class="flex flex-col">
    <Message v-if="isProcessing || runningJob" severity="info" class="mb-4">
      <div class="flex justify-between items-center">
        <span>Your session is currently processing data</span>
        <span v-if="runningJob"> (active job running)</span>
        <span v-else-if="isProcessing"> (files in processing queue)</span>
        <Button class="ml-4" severity="contrast" variant="outlined" label="Go to processing overview"
          @click="emitProcessingOverview" />
      </div>
    </Message>
    <Message v-if="latestFinishedJob">
      <div class="flex justify-between items-center">
        <span>Your latest job has finished processing</span>
        <Button class="ml-4" severity="contrast" variant="outlined" label="Go to data overview"
          @click="gotoOverview()" />
      </div>
    </Message>
    <div class="flex flex-row gap-4 w-full pt-2">
      <Fieldset legend="Local Source" role="button" tabindex="0" @click="selectedSource = 'local'" :class="[
        'w-1/2 cursor-pointer select-none transition-shadow duration-500 ease-out hover:shadow-lg hover:shadow-slate-300/40 dark:hover:shadow-black/40',
        selectedSource === 'local' ? 'ring-2 ring-[var(--p-primary-color)] bg-sky-50/40 dark:bg-slate-800/50' : 'ring-1 ring-transparent'
      ]">
        <Tag class="mb-2">
          <FileArchive :size="35" />
        </Tag> <br />
        Upload a folder with files to process.
      </Fieldset>
      <Fieldset legend="Data Repository" role="button" tabindex="0" @click="selectedSource = 'repo'" :class="[
        'w-1/2 cursor-pointer select-none transition-shadow duration-500 ease-out hover:shadow-lg hover:shadow-slate-300/40 dark:hover:shadow-black/40',
        selectedSource === 'repo' ? 'ring-2 ring-[var(--p-primary-color)] bg-sky-50/40 dark:bg-slate-800/50' : 'ring-1 ring-transparent'
      ]">
        <div class="flex flex-row">
          <Tag class="mb-2">
            <Server :size="35" />
          </Tag>
        </div>
        Link to datasets from kaggle, Hugging Face, GitHub, Zenodo,
        or other enterprise/government repositories via URL.
      </Fieldset>
    </div>
    <Transition enter-active-class="transition duration-300 ease-out" enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0" leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0" leave-to-class="opacity-0 -translate-y-1">
      <div v-if="selectedSource">
        <Divider class="pt-2" />
        <div v-if="selectedSource === 'local'">
          <div class="mb-2">
            Files will be stored as short as needed and will be attached to this session.
          </div>
          <ProgressBar class="my-2 h-2" v-if="progressBar != 0 && progressBar != 100" mode="indeterminate"
            :value="progressBar"></ProgressBar>
          <div class="flex flex-row">
            <div class="flex-auto">
              <FileUpload :disabled="uploadFinished" name="uploadedFiles" ref="fileUpload" mode="advanced"
                url="/api/upload" @select="uploadFinished = false" @upload="finishUpload"
                accept=".csv,.xml,.json,.pdf,.xlsx" :max-file-size="2e9" :multiple="true" @progress="progress" :pt="{
                  input: {
                    multiple: true
                  }
                }" />
            </div>
          </div>
          <div
            class="mt-4 rounded-lg border border-dashed border-surface-300 bg-surface-50/70 p-4 dark:border-surface-700 dark:bg-surface-800/40">
            <div class="text-sm font-medium">Optional contextual metadata</div>
            <div class="mt-1 text-sm text-surface-500">
              Upload README files, codebooks, dictionaries, or other notes that help the processor understand the data.
            </div>
            <FileUpload name="metadataFiles" mode="advanced" url="/api/metadata"
              accept=".txt,.md,.csv,.json,.xml,.ttl,.rdf,.yaml,.yml,.pdf" :max-file-size="50 * 1024 * 1024"
              :multiple="true" class="mt-3" :pt="{
                input: {
                  multiple: true
                }
              }" />
          </div>
          <Message class="mt-2" v-if="uploadFinished" severity="success">Upload finished!</Message>
        </div>
        <div v-else>
          <ChooseProvider @status-change="repoStatus = $event" @provider-change="repoProvider = $event"
            @scan-success="handleRepoScanSuccess" />
          <div class="mt-4" v-if="downloadStatus !== 'idle'">
            <ProgressBar v-if="downloadStatus === 'pending'" :value="downloadProgress" :showValue="false" class="h-2" />
            <Message v-else-if="downloadStatus === 'success'" severity="success">Download completed.</Message>
            <Message v-else-if="downloadStatus === 'error'" severity="error">{{ downloadError || 'Download failed.' }}
            </Message>
            <div v-if="downloadStatus === 'pending'" class="mt-2 text-sm text-surface-500">
              {{ downloadMessage || 'Downloading dataset...' }}
            </div>
          </div>
        </div>
      </div>
    </Transition>
    <div class="flex pt-6 justify-end">
      <Button label="Next" :disabled="!mayContinue" @click="emitNext" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { FileArchive, Server } from '@lucide/vue'
import type { Job } from 'bullmq'
import { Button, Divider, Fieldset, FileUpload, Message, ProgressBar, Tag } from 'primevue'
import { computed, ref, watch } from 'vue'
import ChooseProvider from '~/components/providers/ChooseProvider.vue'
import type { LatestJobDTO } from '~~/shared/types/dto'
import { usePresenceSocket } from '~/composables/usePresence'
import type { WorkerProgress } from '@@/shared/types/workers'

const emit = defineEmits<{
  next: [],
  goto: [job: Job],
  processing: []
}>()

const { data: processingStatus } = await useFetch('/api/job/process/status')
const { data: latestFinishedJob } = await useFetch<LatestJobDTO>('/api/job/process/latest-completed')
const isProcessing = computed(() => processingStatus.value ?? false)
const runningJob = computed(() => processingStatus.value ?? false)

const selectedSource = ref<'local' | 'repo' | null>(null)
const progressBar = ref(0)
const uploadFinished = ref(false)
const repoStatus = ref('idle')
const repoProvider = ref('Unknown')
const repoUrl = ref('')
const repoIdentifier = ref('')
const downloadStatus = ref<'idle' | 'pending' | 'success' | 'error'>('idle')
const downloadProgress = ref(0)
const downloadMessage = ref('')
const downloadError = ref('')
const lastDownloadUrl = ref('')
const supportedDownloadProviders = ['GitHub', 'Kaggle', 'HuggingFace', 'Zenodo']

const { socket } = usePresenceSocket()

const { data: downloadStatusResponse } = await useFetch('/api/job/download/status')
async function startDownload(payload: { url: string; provider: string; identifier: string }) {
  try {
    await $fetch('/api/job/download/start', {
      method: 'POST',
      body: payload
    })
    return null
  } catch (error: any) {
    return error
  }
}

if (downloadStatusResponse.value?.job) {
  const workerProgress = downloadStatusResponse.value.job.progress as WorkerProgress
  downloadProgress.value = workerProgress?.progress ?? 0
  downloadMessage.value = workerProgress?.message ?? 'Downloading dataset...'
  downloadStatus.value = 'pending'
} else if (downloadStatusResponse.value?.status === 'completed') {
  downloadStatus.value = 'success'
  downloadProgress.value = 100
  downloadMessage.value = 'Download completed'
} else if (downloadStatusResponse.value?.status === 'failed') {
  downloadStatus.value = 'error'
  downloadError.value = downloadStatusResponse.value?.errorMessage || 'Download failed'
}

function progress(event: any) {
  progressBar.value = event.progress
}
function finishUpload() {
  uploadFinished.value = true
}

const mayContinue = computed(() => (selectedSource.value == 'local' && uploadFinished.value)
  ||
  (
    selectedSource.value == 'repo' &&
    repoStatus.value == 'success' &&
    repoProvider.value != 'Unknown' &&
    downloadStatus.value == 'success'
  ))

function emitNext() {
  emit('next')
}

function emitProcessingOverview() {
  emit('processing')
}

function gotoOverview() {
  emit('goto', latestFinishedJob.value as Job)
}

async function handleRepoScanSuccess(payload: { url: string; provider: string; identifier: string }) {
  repoUrl.value = payload.url
  repoProvider.value = payload.provider
  repoIdentifier.value = payload.identifier

  if (!supportedDownloadProviders.includes(payload.provider)) {
    downloadStatus.value = 'error'
    downloadError.value = 'Downloads currently supported for GitHub, Kaggle, and Hugging Face.'
    return
  }

  if (payload.url && payload.url !== lastDownloadUrl.value) {
    lastDownloadUrl.value = payload.url
    downloadStatus.value = 'pending'
    downloadProgress.value = 0
    downloadMessage.value = 'Starting download...'
    downloadError.value = ''

    const error = await startDownload({
      url: payload.url,
      provider: payload.provider,
      identifier: payload.identifier
    })

    if (error) {
      downloadStatus.value = 'error'
      downloadError.value = error?.data?.message
        || error?.data?.statusMessage
        || error?.message
        || 'Failed to start download'
    }
  }
}

watch(socket, (newSocket) => {
  if (!newSocket) return

  newSocket.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data)
      if (data.type === 'download-progress') {
        downloadStatus.value = 'pending'
        downloadProgress.value = data.progress || 0
        downloadMessage.value = data.message || 'Downloading dataset...'
      } else if (data.type === 'download-completed') {
        downloadStatus.value = 'success'
        downloadProgress.value = 100
        downloadMessage.value = 'Download completed'
      } else if (data.type === 'download-failed') {
        downloadStatus.value = 'error'
        downloadError.value = data.message || 'Download failed'
      }
    } catch (e) {
      console.error('Failed to parse WS message', e)
    }
  })
}, { immediate: true })
</script>

<style scoped></style>
