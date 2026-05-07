<template>
  <div class="flex flex-col w-full px-4">
    <div v-if="!processingDone" class="flex flex-col items-center justify-center p-8 space-y-6">
      <Loader2 class="animate-spin text-[var(--p-primary-color)]" :size="48" />
      <div class="text-xl font-medium tracking-tight">Processing your data...</div>
      
      <div class="w-full max-w-md">
        <div class="flex justify-between mb-2 text-sm text-surface-500">
          <span>{{ currentAction || 'Initializing...' }}</span>
          <span>{{ Math.round(progress) }}%</span>
        </div>
        <ProgressBar :value="progress" :showValue="false" class="h-2" />
      </div>
    </div>
    
    <div v-else class="flex flex-col items-center justify-center p-8 space-y-6">
      <div class="rounded-full bg-green-100 p-4 dark:bg-green-900/30">
        <CheckCircle class="text-green-600 dark:text-green-500" :size="48" />
      </div>
      <div class="text-xl font-medium tracking-tight">Processing Complete!</div>
      <p class="text-surface-500 text-center max-w-md">
        Your data has been successfully processed and metadata has been extracted.
      </p>
    </div>

    <div class="flex pt-6 justify-end">
      <Button label="Next" @click="$emit('next')" :disabled="!processingDone" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, watch, onMounted } from 'vue'
const props = defineProps<{ mode: 'processing' | 'pending' }>()

onMounted(() => {
  if (props.mode === 'processing') {
    progress.value = 10
    currentAction.value = 'Processing...'
    processingDone.value = false
  } else {
    progress.value = 0
    currentAction.value = 'Waiting to start...'
    processingDone.value = false
  }
})
import { Loader2, CheckCircle } from '@lucide/vue'
import { Button, ProgressBar } from 'primevue'
import { usePresenceSocket } from '~/composables/usePresence'

defineEmits(['next'])

const progress = ref(0)
const currentAction = ref('')
const processingDone = ref(false)

const { socket } = usePresenceSocket()

watch(socket, (newSocket) => {
  if (!newSocket) return

  newSocket.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data)
      if (data.type === 'progress') {
        progress.value = data.progress || 0
        currentAction.value = data.message || 'Processing...'
      } else if (data.type === 'completed') {
        progress.value = 100
        currentAction.value = 'Finished!'
        processingDone.value = true
      } else if (data.type === 'failed') {
        currentAction.value = 'Processing failed.'
        // Handle error state
      }
    } catch (e) {
      console.error('Failed to parse WS message', e)
    }
  })
}, { immediate: true })

</script>
