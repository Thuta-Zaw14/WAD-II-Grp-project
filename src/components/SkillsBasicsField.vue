<script setup>
import MediaPicker from '@/components/MediaPicker.vue'
import { picturesEnabled } from '@/config'

const props = defineProps({ titleError: { type: String, default: '' } })
const emit = defineEmits(['title-input', 'title-blur'])
const title = defineModel('title', { type: String, default: '' })
const description = defineModel('description', { type: String, default: '' })
const media = defineModel('media', { type: Array, default: () => [] })
</script>

<template>
  <div>
    <div class="mb-3">
      <label class="form-label" for="skill-title">Title <span class="required-marker" aria-hidden="true">*</span></label>
      <input
        id="skill-title"
        v-model="title"
        class="form-control"
        :class="{ 'is-invalid': props.titleError }"
        :aria-invalid="!!props.titleError"
        :aria-describedby="props.titleError ? 'skill-title-error' : undefined"
        maxlength="60"
        required
        @input="emit('title-input')"
        @blur="emit('title-blur')"
      />
      <div v-if="props.titleError" id="skill-title-error" class="invalid-feedback d-block">
        {{ props.titleError }}
      </div>
    </div>

    <div class="mb-3">
      <label class="form-label" for="skill-desc">Short description</label>
      <textarea id="skill-desc" v-model="description" class="form-control" rows="3" maxlength="1000" />
    </div>

    <MediaPicker v-if="picturesEnabled" v-model="media" :max="5" />
  </div>
</template>

<style scoped>
.required-marker {
  color: #dc3545;
  font-weight: 700;
}
</style>