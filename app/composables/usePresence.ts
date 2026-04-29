export const usePresenceSocket = () => {
  const sessionId = useState(
    'session-id',
    () => crypto.randomUUID()
  )

  let socket: WebSocket | null = null
  let heartbeat: any = null

  const connect = () => {
    socket = new WebSocket('ws://localhost:3000/_ws')

    socket.onopen = () => {
      socket?.send(JSON.stringify({
        type: 'identify',
        sessionId: sessionId.value
      }))

      heartbeat = setInterval(() => {
        socket?.send(JSON.stringify({
          type: 'heartbeat',
          sessionId: sessionId.value
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