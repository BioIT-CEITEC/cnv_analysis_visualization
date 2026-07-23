<script setup>
import { ref, computed, watch } from "vue";

const props = defineProps({
  samples:    Array,
  sample:     String,
  resultCount: Number,
});

const emit = defineEmits([
  "update:sample",
]);

// Searchable sample combobox — lets the user type a sample name instead of only
// scrolling a plain <select>, which gets unwieldy with large cohorts.
const ALL_LABEL = "All (cohort)";
const options   = computed(() => [ALL_LABEL, ...props.samples]);
const labelFor  = (s) => (s === "all" ? ALL_LABEL : s);

const search       = ref(labelFor(props.sample));
const dropdownOpen = ref(false);
const inputRef     = ref(null);

// Keep the input text in sync when the selected sample changes from elsewhere
// (e.g. jumping to a sample from a table row), as long as the user isn't mid-search.
watch(() => props.sample, (s) => {
  if (!dropdownOpen.value) search.value = labelFor(s);
});

const filteredOptions = computed(() => {
  if (!search.value) return options.value;
  const q = search.value.toLowerCase();
  return options.value.filter((o) => o.toLowerCase().includes(q));
});

function onFocus() {
  search.value = "";
  dropdownOpen.value = true;
}
function onInput() {
  dropdownOpen.value = true;
}
function onBlur() {
  dropdownOpen.value = false;
  search.value = labelFor(props.sample);
}
function selectOption(opt) {
  search.value = opt;
  dropdownOpen.value = false;
  emit("update:sample", opt === ALL_LABEL ? "all" : opt);
  inputRef.value?.blur();
}
</script>

<template>
  <div class="flex flex-col gap-4">

    <!-- Sample -->
    <div class="flex flex-col gap-1">
      <label class="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Sample</label>
      <div class="relative">
        <input
          ref="inputRef"
          type="text"
          v-model="search"
          @focus="onFocus"
          @input="onInput"
          @blur="onBlur"
          class="w-full bg-white border border-gray-300 text-gray-700 text-sm rounded-md px-2 py-1.5 outline-none focus:border-teal-500"
        />
        <div
          v-if="dropdownOpen"
          class="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto"
        >
          <div
            v-for="opt in filteredOptions"
            :key="opt"
            @mousedown.prevent
            @click="selectOption(opt)"
            :class="['px-2 py-1.5 text-sm cursor-pointer hover:bg-teal-50 hover:text-teal-700', opt === labelFor(sample) ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700']"
          >{{ opt }}</div>
          <div v-if="!filteredOptions.length" class="px-2 py-1.5 text-sm text-gray-300">No results</div>
        </div>
      </div>
    </div>

    <!-- Count -->
    <div class="flex items-center justify-end pt-1">
      <span class="text-xs text-gray-400">{{ resultCount }} targets</span>
    </div>

  </div>
</template>
