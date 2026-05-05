// https://nuxt.com/docs/api/configuration/nuxt-config
import { ExtractPreset } from './app/theme/preset';
import tailwindcss from "@tailwindcss/vite";


export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  runtimeConfig: {
    redisUrl: process.env.NUXT_REDIS_URL || '',
    llmUrl: process.env.NUXT_LLM_URL || '',
    llmToken: process.env.NUXT_LLM_TOKEN || '',
  },
  nitro: {
    experimental: {
      websocket: true
    }
  },
  vite: {
    plugins: [
      tailwindcss()
    ],
    optimizeDeps: {
      include: [
        '@vue/devtools-core',
        '@vue/devtools-kit',
        '@lucide/vue',
      ]
    }
  },
  css: ['./app/assets/css/main.css'],
  modules: ["@primevue/nuxt-module", '@pinia/nuxt', '@nuxt/test-utils/module'],
  primevue: {
    options: {
      theme: {
        preset: ExtractPreset,
        options: {
          darkModeSelector: '.dark',
          cssLayer: {
            name: 'primevue',
            order: 'theme, base, primevue, components, utilities',
          },
        },
      }
    }
  },
  fileStorage: {
    mount: process.env.FILES_MOUNT
  }
})
