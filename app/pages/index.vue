<template>
  <div class="min-h-screen bg-surface-ground px-6 py-16 text-slate-900 dark:text-slate-50">
    <div class="mx-auto w-full max-w-5xl">
      <Hero />

      <main class="mx-auto mt-8 px-4">
        <section class="mx-auto max-w-4xl">
          <Card
            class="border border-surface-200 bg-surface-card shadow-2xl shadow-slate-200/70 backdrop-blur dark:border-surface-700 dark:shadow-black/30">
            <template #title>
              <div class="text-2xl font-semibold tracking-tight flex flex-row gap-2">Source type</div>
            </template>
            <template #content>
              <Stepper v-model:value="currentStep" linear>
                <StepList>
                  <Step value="1">Select data</Step>
                  <Step value="2">Select schema</Step>
                  <Step value="3">Data processing</Step>
                  <Step value="4">Complement data</Step>
                </StepList>
                <StepPanel v-slot="{ activateCallback }" value="1">
                  <DataSourceStep
                    @next="activateCallback('2'); currentStep = '2'"
                    @goto="(data: Job) => {gotoOverview(data); activateCallback('4')}"
                  />
                </StepPanel>
                <StepPanel v-slot="{ activateCallback }" value="2">
                  Before continuing, select which metadata schema(s) should be generated.
                  <SelectSchemaStep
                    @next="startProcessingAndContinue(activateCallback)"
                  />
                </StepPanel>
                <StepPanel v-slot="{ activateCallback }" value="3">
                  <DataProcessingStep
                    v-if="currentStep == '3'"
                    @next="activateCallback('4'); currentStep = '4'"
                  />
                </StepPanel>
                <StepPanel v-slot="{ activateCallback }" value="4">
                  <DataOverviewStep
                    v-if="currentStep == '4'"
                    @next=""
                    :latest-job="latestJob"
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
import { ref } from 'vue'
import Hero from '~/components/Hero.vue'
import DataProcessingStep from '~/components/DataProcessingStep.vue'
import DataSourceStep from '~/components/DataSourceStep.vue'
import { Job } from 'bullmq'
const currentStep = ref('2')
const latestJob = ref<Job>()
const { execute: startProcess } = useLazyFetch('/api/job/start', { immediate: false })

function gotoOverview(data: Job) {
  latestJob.value = data
  currentStep.value = '4'
}

function startProcessingAndContinue(activateCallback: (step: string) => void) {
  startProcess()
  activateCallback('3')
  currentStep.value = '3'
}
</script>

<style></style>