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
    kaggleUsername: process.env.NUXT_KAGGLE_USERNAME || '',
    kaggleKey: process.env.NUXT_KAGGLE_KEY || '',
    huggingFaceToken: process.env.NUXT_HF_TOKEN || '',
    useAi: !process.env.NUXT_REMOVE_AI,
    preferredModel: process.env.NUXT_LLM_MODEL || 'qwen/qwen3-8b',
    useCleanup: !process.env.NUXT_STOP_CLEANUP,
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
    directives: {
      include: ['Tooltip']
    },
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
