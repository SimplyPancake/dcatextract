<template>
    <div>
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
            :is-error="status === 'error'" :error-kind="feedbackErrorKind" :message="feedbackErrorMessage"
            :identifier="feedbackIdentifier" />
    </div>
</template>

<script lang="ts" setup>
import { DatabaseSearch, Loader2, Scan, TriangleAlert } from '@lucide/vue'
import { Button, InputGroup, InputGroupAddon, InputText } from 'primevue'
import ProviderFeedback from '~/components/providers/ProviderFeedback.vue'
import SourceLogo from '~/components/providers/SourceLogo.vue'

const emit = defineEmits<{
    statusChange: [status: string]
    providerChange: [provider: string]
    scanSuccess: [payload: { url: string; provider: string; identifier: string }]
}>()

const urlInput = ref('')
const requestBody = computed(() => ({ url: urlInput.value }))

const { status, data: urlScanResult, error, execute } = useLazyFetch('/api/urlscan', {
  method: 'POST',
  body: requestBody,
  immediate: false
})

const showProviderFeedback = computed(() => status.value === 'success' || status.value === 'error')
const feedbackProvider = computed(() => urlScanResult.value?.sourceType ?? 'Unknown')
const feedbackIdentifier = computed(() => urlScanResult.value?.identifier)
const feedbackErrorMessage = computed(() => {
  const data = (error.value as { data?: { message?: string; statusMessage?: string } } | null)?.data
  return data?.message || data?.statusMessage || error.value?.message
})

const feedbackErrorKind = computed(() => {
    const statusCode = (error.value as { statusCode?: number } | null)?.statusCode
    const statusMessage = (error.value as { data?: { statusMessage?: string } } | null)?.data?.statusMessage
    if (!statusCode) return 'server'
    if (statusCode === 422) return 'missing-identifier'
    if (statusCode === 400 && statusMessage === 'Invalid URL') return 'invalid-url'
    if (statusCode === 400) return 'unknown-provider'
    return 'server'
})

watch(status, (value) => {
    emit('statusChange', value)
}, { immediate: true })

watch(feedbackProvider, (value) => {
    emit('providerChange', value)
}, { immediate: true })

watch([status, urlScanResult], ([currentStatus, result]) => {
    if (currentStatus === 'success' && result) {
        emit('scanSuccess', {
            url: urlInput.value,
            provider: result.sourceType,
            identifier: result.identifier
        })
    }
})
</script>

<style></style>