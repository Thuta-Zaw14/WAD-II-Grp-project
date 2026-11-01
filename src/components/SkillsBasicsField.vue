<script setup>
import MediaPicker from '@/components/MediaPicker.vue'
import { picturesEnabled } from '@/config'

const title = defineModel('title', { type: String, default: '' })
const description = defineModel('description', { type: String, default: '' })
const media = defineModel('media', { type: Array, default: () => [] })
</script>

<template>
  <div>
    <div class="mb-3">
      <label class="form-label" for="skill-title">Title <span class="text-danger">*</span></label>
      <input id="skill-title" v-model="title" class="form-control" maxlength="60" required />
    </div>

    <div class="mb-3">
      <label class="form-label" for="skill-desc">Short description</label>
      <textarea id="skill-desc" v-model="description" class="form-control" rows="3" maxlength="1000" />
    </div>

    <MediaPicker v-if="picturesEnabled" v-model="media" :max="5" />
  </div>
</template>