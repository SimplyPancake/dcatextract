import { sessions } from '../utils/session-registry'

export default defineWebSocketHandler({
  open(peer) {
    console.log('socket opened')
  },

  async message(peer, message) {
    const data = JSON.parse(message.text())

    if (data.type === 'identify') {
      const sessionId = data.sessionId

      let session = sessions.get(sessionId)

      if (!session) {
        session = {
          sessionId,
          connected: true,
          lastSeen: Date.now(),
          files: []
        }

        sessions.set(sessionId, session)
      }

      session.connected = true
      session.lastSeen = Date.now()

      // cancel pending cleanup
      if (session.cleanupTimeout) {
        clearTimeout(session.cleanupTimeout)
      }

      peer.context.sessionId = sessionId

      console.log(`User connected: ${sessionId}`)
    }

    if (data.type === 'heartbeat') {
      const session = sessions.get(data.sessionId)

      if (session) {
        session.lastSeen = Date.now()
      }
    }
  },

  close(peer) {
    const sessionId = peer.context.sessionId as (string | undefined)

    if (!sessionId) return

    const session = sessions.get(sessionId)

    if (!session) return

    session.connected = false

    console.log(`Disconnected: ${sessionId}`)

    // GRACE PERIOD
    session.cleanupTimeout = setTimeout(async () => {
      const latest = sessions.get(sessionId)

      if (!latest?.connected) {
        console.log(`Cleaning session: ${sessionId}`)

        await deleteFilesForSession(sessionId)

        sessions.delete(sessionId)
      }
    }, 60_000)
  }
})

async function deleteFilesForSession(sessionId: string) {
  const session = sessions.get(sessionId)

  if (!session) return

  for (const file of session.files) {
    console.log('Deleting file:', file)

    // fs.unlinkSync(file)
  }
}