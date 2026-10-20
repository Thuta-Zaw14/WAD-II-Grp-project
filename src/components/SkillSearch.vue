<script setup>
import { ref, computed } from 'vue'
import { matches } from '../searchUtils'

const props = defineProps({
  modelValue: { type: String, default: '' }, // the text in the search box
  skills: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue'])

const open = ref(false) // is the dropdown showing?
const active = ref(-1) // which row is highlighted (-1 = none)

// One entry per skill, with how many people teach it
const skillList = computed(() => {
  const list = []
  for (const s of props.skills) {
    const found = list.find((x) => x.name === s.skill)
    if (found) {
      found.count++
    } else {
      list.push({ name: s.skill, category: s.category, count: 1 })
    }
  }
  return list
})

// The rows in the dropdown
const items = computed(() => {
  const list = []
  if (props.modelValue === '') return list

  for (const s of skillList.value) {
    if (matches(props.modelValue, [s.name, s.category])) {
      const note = s.count === 1 ? '1 teacher' : s.count + ' teachers'
      list.push({ label: s.name, query: s.name, note: note })
    }
  }

  return list
})

function onInput(e) {
  emit('update:modelValue', e.target.value)
  open.value = true
  active.value = -1
}

function choose(item) {
  emit('update:modelValue', item.query)
  open.value = false
  active.value = -1
}

function onKeydown(e) {
  if (!open.value || items.value.length === 0) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    active.value = Math.min(active.value + 1, items.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    active.value = Math.max(active.value - 1, 0)
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault()
    // pick the highlighted row, or the top one if nothing is highlighted
    choose(items.value[active.value === -1 ? 0 : active.value])
  } else if (e.key === 'Escape') {
    open.value = false
  }
}
</script>

<template>
  <div class="position-relative mb-3">
    <input
      :value="modelValue"
      type="search"
      class="form-control"
      placeholder="Search skills, e.g. tennis, photography, Python..."
      autocomplete="off"
      @input="onInput"
      @keydown="onKeydown"
      @focus="open = true"
      @blur="open = false"
    />

    <ul v-if="open && items.length > 0" class="list-group suggestions shadow-sm">
      <li
        v-for="(item, i) in items"
        :key="item.query"
        class="list-group-item d-flex justify-content-between suggestion"
        :class="{ 'is-active': i === active }"
        @mousedown.prevent
        @click="choose(item)"
        @mouseenter="active = i"
      >
        <span>{{ item.label }}</span>
        <small class="text-muted">{{ item.note }}</small>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 2000; /* stays on top of the map */
  max-height: 300px;
  overflow-y: auto;
}

.suggestion {
  cursor: pointer;
}

.suggestion.is-active {
  background: #f5f0e1;
  color: #4a3f2a;
}
</style>