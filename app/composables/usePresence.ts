import { ref, onMounted, onBeforeUnmount } from 'vue'

function getSessionIdFromLocalStorage() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('sessionId')
}

function setSessionIdToLocalStorage(id: string) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('sessionId', id)
  }
}

// Global state for shared socket connection
const globalSocket = ref<WebSocket | null>(null)
let globalHeartbeat: any = null
let connectionCount = 0

export const usePresenceSocket = () => {
  let sessionId = getSessionIdFromLocalStorage()
  if (!sessionId) {
    sessionId = crypto.randomUUID()
    setSessionIdToLocalStorage(sessionId)
  }

  // Always set sessionId as cookie so backend can read it
  const setSessionCookie = () => {
    if (typeof document === 'undefined') return;
    const id = getSessionIdFromLocalStorage() || sessionId
    document.cookie = `sessionId=${id}; path=/; SameSite=Lax;`;
  }

  const connect = () => {
    if (globalSocket.value && (globalSocket.value.readyState === WebSocket.OPEN || globalSocket.value.readyState === WebSocket.CONNECTING)) {
      return // Already connected or connecting
    }

    setSessionIdToLocalStorage(sessionId!)
    setSessionCookie()
    globalSocket.value = new WebSocket('ws://localhost:3000/_ws')

    globalSocket.value.onopen = () => {
      globalSocket.value?.send(JSON.stringify({
        type: 'identify',
        sessionId: sessionId
      }))

      if (globalHeartbeat) clearInterval(globalHeartbeat)
      globalHeartbeat = setInterval(() => {
        globalSocket.value?.send(JSON.stringify({
          type: 'heartbeat',
          sessionId: sessionId
        }))
      }, 30_000)
    }

    globalSocket.value.onclose = () => {
      clearInterval(globalHeartbeat)
      globalHeartbeat = null
      
      // Auto-reconnect if there are still components using it
      if (connectionCount > 0) {
        setTimeout(connect, 2000)
      }
    }
  }

  onMounted(() => {
    connectionCount++
    connect()
  })

  onBeforeUnmount(() => {
    connectionCount--
    if (connectionCount <= 0) {
      clearInterval(globalHeartbeat)
      globalHeartbeat = null
      globalSocket.value?.close()
      globalSocket.value = null
      connectionCount = 0
    }
  })

  return {
    sessionId,
    socket: globalSocket
  }
}