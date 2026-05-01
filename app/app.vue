<template>
  <NuxtLoadingIndicator />
  <div
    class="min-h-screen bg-[radial-gradient(circle_at_top,#e2e8f0_0%,#f8fafc_38%,#eef2ff_100%)] text-slate-900 transition-colors duration-300 dark:bg-[radial-gradient(circle_at_top,_#1e293b_0%,_#020617_48%,_#020617_100%)] dark:text-slate-50">
    <NuxtPage />
    <ThemeToggleButton />
  </div>
</template>

<script setup lang="ts">
const presence = usePresenceSocket()
</script>