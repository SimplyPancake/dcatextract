<template>
    <div class="flex flex-col gap-3">
        <template v-for="(value, key) in localModel" :key="key">

            <!-- STRING -->
            <div v-if="isString(value)">
                <label class="block mb-2 font-medium">{{ formatLabel(key) }}</label>

                <InputText v-model="localModel[key]" class="w-full" />
            </div>

            <!-- NUMBER -->
            <div v-else-if="isNumber(value)">
                <label class="block mb-2 font-medium">{{ formatLabel(key) }}</label>

                <InputNumber v-model="localModel[key]" class="w-full" />
            </div>

            <!-- BOOLEAN -->
            <div v-else-if="isBoolean(value)" class="flex align-items-center gap-2">
                <Checkbox v-model="localModel[key]" binary />

                <label>{{ formatLabel(key) }}</label>
            </div>

            <!-- DATE STRING -->
            <div v-else-if="isDate(value)">
                <label class="block mb-2 font-medium">{{ formatLabel(key) }}</label>

                <DatePicker v-model="localModel[key]" dateFormat="yy-mm-dd" class="w-full" />
            </div>

            <!-- NESTED OBJECT -->
            <Fieldset v-else-if="isObject(value)" :legend="formatLabel(key)">
                <DynamicForm v-model="localModel[key]" />
            </Fieldset>

            <!-- ARRAY -->
            <div v-else-if="isArray(value)">
                <label class="block mb-2 font-medium">
                    {{ formatLabel(key) }}
                </label>

                <div class="flex flex-col gap-2">

                    <div v-for="(item, index) in localModel[key]" :key="index" class="flex gap-2 items-start">

                        <!-- primitive array -->
                        <InputText v-if="isPrimitive(item)" v-model="localModel[key][index]" class="w-full" />

                        <!-- object array -->
                        <Fieldset v-else-if="isObject(item)" class="w-full">
                            <DynamicForm v-model="localModel[key][index]" />
                        </Fieldset>

                        <!-- remove -->
                        <Button icon="pi pi-trash" severity="danger" text @click="removeArrayItem(key, index)" />
                    </div>

                    <Button label="Add" icon="pi pi-plus" size="small" @click="addArrayItem(key, value)" />
                </div>
            </div>

        </template>
    </div>
</template>

<script setup>
import { reactive, watch } from 'vue'

import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Checkbox from 'primevue/checkbox'
import DatePicker from 'primevue/datepicker'
import Fieldset from 'primevue/fieldset'

const props = defineProps({
    modelValue: {
        type: Object,
        required: true
    }
})

const emit = defineEmits(['update:modelValue'])

const localModel = reactive(props.modelValue ?? {})

watch(
    localModel,
    () => {
        emit('update:modelValue', localModel)
    },
    { deep: true }
)

function isString(value) {
    return typeof value === 'string' && !isDate(value)
}

function isNumber(value) {
    return typeof value === 'number'
}

function isBoolean(value) {
    return typeof value === 'boolean'
}

function isObject(value) {
    return value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        !(value instanceof Date)
}

function isDate(value) {
    return typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function formatLabel(key) {
    return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, s => s.toUpperCase())
}

function isArray(value) {
  return Array.isArray(value)
}

function isPrimitive(value) {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
}

function addArrayItem(key, value) {
  if (!Array.isArray(localModel[key])) {
    localModel[key] = []
  }

  // guess type from first item
  const template = value?.[0]

  if (isObject(template)) {
    localModel[key].push({})
  } else if (typeof template === 'number') {
    localModel[key].push(0)
  } else if (typeof template === 'boolean') {
    localModel[key].push(false)
  } else {
    localModel[key].push('')
  }
}

function removeArrayItem(key, index) {
  localModel[key].splice(index, 1)
}
</script>