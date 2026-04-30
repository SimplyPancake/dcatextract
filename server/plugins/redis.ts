import { createClient } from 'redis'

let client: ReturnType<typeof createClient>
const config = useRuntimeConfig()

export default defineNitroPlugin(async () => {
  if (!client) {
    client = createClient({
      url: config.redisUrl
    })

    client.on('error', (err) => {
      console.error('Redis error:', err)
    })

    await client.connect()
  }

  // expose globally in Nitro
  useNitroApp().redis = client
})