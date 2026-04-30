function getSessionIdFromLocalStorage() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('sessionId')
}

function setSessionIdToLocalStorage(id: string) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('sessionId', id)
  }
}

export const usePresenceSocket = () => {
  let sessionId = getSessionIdFromLocalStorage()
  if (!sessionId) {
    sessionId = crypto.randomUUID()
    setSessionIdToLocalStorage(sessionId)
  }

  let socket: WebSocket | null = null
  let heartbeat: any = null


  // Always set sessionId as cookie so backend can read it
  const setSessionCookie = () => {
    if (typeof document === 'undefined') return;
    const id = getSessionIdFromLocalStorage() || sessionId
    document.cookie = `sessionId=${id}; path=/; SameSite=Lax;`;
  }

  const connect = () => {
    setSessionIdToLocalStorage(sessionId)
    setSessionCookie()
    socket = new WebSocket('ws://localhost:3000/_ws')

    socket.onopen = () => {
      socket?.send(JSON.stringify({
        type: 'identify',
        sessionId: sessionId
      }))

      heartbeat = setInterval(() => {
        socket?.send(JSON.stringify({
          type: 'heartbeat',
          sessionId: sessionId
        }))
      }, 30_000)
    }

    socket.onclose = () => {
      clearInterval(heartbeat)

      // auto reconnect
      setTimeout(connect, 2000)
    }
  }

  onMounted(connect)

  onBeforeUnmount(() => {
    clearInterval(heartbeat)
    socket?.close()
  })

  return {
    sessionId
  }
}