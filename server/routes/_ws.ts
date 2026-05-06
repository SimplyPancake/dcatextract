import { getRedis } from "../utils/redis"


export default defineWebSocketHandler({
  // TODO: On reconnect, remove cleanup

  async open(peer) {
    console.log('socket opened')
  },

  async message(peer, message) {
    const data = JSON.parse(message.text())


    if (data.type === 'identify') {
      const sessionId = data.sessionId
      const redis = getRedis()
      await redis.set(
        `session:${sessionId}`,
        JSON.stringify({ connected: true, lastSeen: Date.now() }),
        'EX',
        90
      )
      peer.context.sessionId = sessionId
      console.log(`User connected: ${sessionId}`)
    }

    if (data.type === 'heartbeat') {
      const sessionId = data.sessionId
      const redis = getRedis()
      await redis.expire(`session:${sessionId}`, 90)
    }
  },

  async close(peer) {
    const sessionId = peer.context.sessionId as string | undefined
    if (!sessionId) return
    console.log(`Disconnected: ${sessionId} (cleanup scheduled)`)
  }
})