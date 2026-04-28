<template>
  <button
    type="button"
    class="fixed right-4 top-4 z-50 inline-flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-700 shadow-lg shadow-slate-300/50 transition hover:scale-105 hover:bg-white dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-100 dark:shadow-black/30 dark:hover:bg-slate-800"
    :aria-label="isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'"
    @click="toggleTheme"
  >
    <Sun v-if="isDarkMode" />
    <Moon v-else></Moon>
  </button>
</template>

<script lang="ts" setup>
import { Moon, Sun } from '@lucide/vue'
import { onMounted, ref, watch } from 'vue'

const themeKey = 'dcatextract-theme'
const isDarkMode = ref(false)

const applyTheme = (value: boolean) => {
  document.documentElement.classList.toggle('dark', value)
}

const toggleTheme = () => {
  isDarkMode.value = !isDarkMode.value
}

onMounted(() => {
  const storedTheme = localStorage.getItem(themeKey)
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  isDarkMode.value = storedTheme ? storedTheme === 'dark' : prefersDark
  applyTheme(isDarkMode.value)
})

watch(isDarkMode, (value) => {
  if (import.meta.client) {
    localStorage.setItem(themeKey, value ? 'dark' : 'light')
    applyTheme(value)
  }
})
</script>