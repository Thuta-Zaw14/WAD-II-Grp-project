<script setup>
import { ref, watch } from 'vue'
import { loadMedia } from '@/services/progressMedia'

// One square photo. A saved photo (mediaId) is fetched with the login token (see
// services/progressMedia.js); a photo that was just picked already has its dataUrl.
const props = defineProps({
  mediaId: { type: String, default: '' },
  dataUrl: { type: String, default: '' },
  alt: { type: String, default: '' },
})

const src = ref(props.dataUrl)
const failed = ref(false)

watch(
  () => [props.mediaId, props.dataUrl],
  async () => {
    failed.value = false
    if (props.dataUrl) {
      src.value = props.dataUrl
      return
    }
    src.value = ''
    if (!props.mediaId) return
    try {
      src.value = await loadMedia(props.mediaId)
    } catch {
      failed.value = true
    }
  },
  { immediate: true }
)
</script>

<template>
  <div class="thumb">
    <img v-if="src" :src="src" :alt="alt" loading="lazy" />
    <span v-else-if="failed" class="small text-muted px-2 text-center">Photo could not load</span>
    <span v-else class="spinner-border spinner-border-sm text-secondary" role="status">
      <span class="visually-hidden">Loading photo</span>
    </span>
  </div>
</template>

<style scoped>
.thumb {
  width: 100%;
  height: 100%;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 12px;
  background: var(--k-surface-alt);
  border: 1px solid var(--k-border);
}

img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
