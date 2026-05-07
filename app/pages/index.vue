<template>
  <div class="min-h-screen bg-surface-ground px-6 py-16 text-slate-900 dark:text-slate-50">
    <div class="mx-auto w-full max-w-5xl">
      <Hero />

      <main class="mx-auto mt-8 px-4">
        <section class="mx-auto max-w-3xl">
          <Card
            class="border border-surface-200 bg-surface-card shadow-2xl shadow-slate-200/70 backdrop-blur dark:border-surface-700 dark:shadow-black/30">
            <template #title>
              <div class="text-2xl font-semibold tracking-tight flex flex-row gap-2">Source type</div>
            </template>
            <template #content>
              <Stepper v-model:value="currentStep" linear>
                <StepList>
                  <Step value="1">Select data</Step>
                  <Step value="2">Data processing</Step>
                  <Step value="3">Complement data</Step>
                </StepList>
                <StepPanel v-slot="{ activateCallback }" value="1">
                  <DataSourceStep
                    @next="activateCallback('2'); currentStep = '2'"
                  />
                </StepPanel>
                <StepPanel v-slot="{ activateCallback }" value="2">
                  <DataProcessingStep
                    v-if="currentStep == '2'"
                    @next="activateCallback('3'); currentStep = '3'"
                  />
                </StepPanel>
              </Stepper>
            </template>
          </Card>
        </section>
      </main>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { Card, Step, StepList, StepPanel, Stepper } from 'primevue'
import { computed } from 'vue'
import Hero from '~/components/Hero.vue'
import DataProcessingStep from '~/components/DataProcessingStep.vue'
import DataSourceStep from '~/components/DataSourceStep.vue'
const currentStep = ref('1')
</script>

<style></style>