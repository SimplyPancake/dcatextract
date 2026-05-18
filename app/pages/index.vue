<template>
  <div class="min-h-screen bg-surface-ground px-6 py-16 text-slate-900 dark:text-slate-50">
    <div class="mx-auto w-full">
      <Hero />

      <main class="mx-auto mt-8 px-4">
        <section class="mx-auto" :class="{
          'max-w-7xl': inOverview,
          'max-w-4xl': !inOverview
        }">
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
                  <Message v-if="unprocessedFilesCount > 0" severity="warn" class="mb-4">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <span>You have {{ unprocessedFilesCount }} unprocessed files (uploads or downloads) from a
                        previous session.</span>
                      <Button severity="contrast" variant="outlined" label="Go to schema selection"
                        @click="activateCallback('2'); currentStep = '2'" />
                    </div>
                  </Message>
                  <DataSourceStep @next="activateCallback('2'); currentStep = '2'"
                    @processing="activateCallback('3'); currentStep = '3'"
                    @goto="(data: Job) => { gotoOverview(data); activateCallback('4') }" />
                </StepPanel>
                <StepPanel v-slot="{ activateCallback }" value="2">
                  Before continuing, select which metadata schema(s) should be generated.
                  <SelectSchemaStep @next="(schemas) => { activateCallback('3'); currentStep = '3' }" />
                </StepPanel>
                <StepPanel v-slot="{ activateCallback }" value="3">
                  <DataProcessingStep v-if="currentStep == '3'" :schemas="selectedSchemas"
                    @next="activateCallback('4'); currentStep = '4'" />
                </StepPanel>
                <StepPanel v-slot="{ activateCallback }" value="4">
                  <DataOverviewStep v-if="currentStep == '4'" @next="" :latest-job="latestJob" />
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
import { Button, Card, Message, Step, StepList, StepPanel, Stepper } from 'primevue'
import { computed, ref } from 'vue'
import Hero from '~/components/Hero.vue'
import DataProcessingStep from '~/components/DataProcessingStep.vue'
import DataSourceStep from '~/components/DataSourceStep.vue'
import { Job } from 'bullmq'
type SchemaSelection = Record<string, boolean>
const currentStep = ref('1')
const latestJob = ref<Job>()
const selectedSchemas = ref<SchemaSelection>({})
const { data: unprocessedData } = await useFetch('/api/unprocessed')
const unprocessedFilesCount = computed(() => unprocessedData.value?.unprocessedCount || 0)
const inOverview = computed(() => currentStep.value == '4')

function gotoOverview(data: Job) {
  latestJob.value = data
  currentStep.value = '4'
}

</script>

<style></style>