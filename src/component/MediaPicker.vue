<script setup>
import { ref, onBeforeUnmount } from 'vue'

const items = defineModel({ type: Array, default: () => [] })
const props = defineProps({
  max: { type: Number, default: 5 },
  allowVideo: { type: Boolean, default: true },
  label: { type: String, default: 'Photos / videos (optional)' },
})

const MAX_IMAGE_MB = 5
const MAX_VIDEO_MB = 30
const error = ref('')

function onPick(event) {
  error.value = ''
  const next = [...items.value]

  for (const file of event.target.files) {
    const isImage = file.type.startsWith('image/')
    const isVideo = props.allowVideo && file.type.startsWith('video/')

    if (!isImage && !isVideo) {
      error.value = props.allowVideo
        ? `${file.name}: only images and videos are allowed.`
        : `${file.name}: only images are allowed here.`
      continue
    }
    const limit = isImage ? MAX_IMAGE_MB : MAX_VIDEO_MB
    if (file.size > limit * 1024 * 1024) {
      error.value = `${file.name} is too large (max ${limit} MB).`
      continue
    }
    if (next.length >= props.max) {
      error.value = `You can attach up to ${props.max} files.`
      break
    }
    next.push({
      file,
      url: URL.createObjectURL(file),
      type: isImage ? 'image' : 'video',
    })
  }

  items.value = next
  event.target.value = ''
}

function remove(index) {
  const item = items.value[index]
  if (item.file) URL.revokeObjectURL(item.url)
  items.value = items.value.filter((_, i) => i !== index)
}

onBeforeUnmount(() =>
  items.value.forEach((i) => i.file && URL.revokeObjectURL(i.url))
)
</script>

<template>
  <div class="mb-3">
    <label class="form-label">
      {{ label }}
      <small class="text-muted">({{ items.length }}/{{ max }})</small>
    </label>
    <input
      type="file"
      class="form-control"
      :accept="allowVideo ? 'image/*,video/*' : 'image/*'"
      multiple
      :disabled="items.length >= max"
      @change="onPick"
    />
    <div v-if="error" class="text-danger small mt-1" role="alert">{{ error }}</div>

    <div class="d-flex flex-wrap gap-2 mt-2">
      <div v-for="(m, i) in items" :key="m.path || m.url" class="position-relative">
        <img v-if="m.type === 'image'" :src="m.url" class="thumb" alt="" />
        <video v-else :src="m.url" class="thumb" muted />
        <button
          type="button"
          class="btn btn-sm btn-danger remove-btn"
          aria-label="Remove file"
          @click="remove(i)"
        >
          ×
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.thumb {
  width: 96px;
  height: 96px;
  object-fit: cover;
  border-radius: 8px;
  background: #eee;
}
.remove-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  padding: 0 6px;
  line-height: 1.2;
}
</style>