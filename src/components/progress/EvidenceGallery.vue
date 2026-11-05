<script setup>
import { ref, computed, onUnmounted } from 'vue'
import MediaThumb from './MediaThumb.vue'
import { loadMedia } from '@/services/progressMedia'
import { youtubeId } from '@/services/progressRules'

// A student's work: their photos (tap one to see it big), their videos (YouTube plays right
// here; other links open in a new tab) and their note.
const props = defineProps({
  mediaIds: { type: Array, default: () => [] },
  links: { type: Array, default: () => [] },
  note: { type: String, default: '' },
})

const videos = computed(() => props.links.map((link) => ({ link, id: youtubeId(link) })))
const bigSrc = ref('')
const bigIndex = ref(-1)

async function open(index) {
  bigIndex.value = index
  bigSrc.value = ''
  try {
    bigSrc.value = await loadMedia(props.mediaIds[index])
  } catch {
    bigIndex.value = -1
  }
  document.addEventListener('keydown', onKey)
}

function close() {
  bigIndex.value = -1
  document.removeEventListener('keydown', onKey)
}

function onKey(event) {
  if (event.key === 'Escape') close()
  if (event.key === 'ArrowRight' && bigIndex.value < props.mediaIds.length - 1) open(bigIndex.value + 1)
  if (event.key === 'ArrowLeft' && bigIndex.value > 0) open(bigIndex.value - 1)
}

onUnmounted(() => document.removeEventListener('keydown', onKey))

function hostOf(link) {
  try {
    return new URL(link).hostname.replace(/^www\./, '')
  } catch {
    return link
  }
}
</script>

<template>
  <div class="gallery" data-testid="evidence-gallery">
    <p v-if="note" class="note mb-3" data-testid="evidence-note">{{ note }}</p>

    <div v-if="mediaIds.length" class="photo-grid mb-3">
      <button
        v-for="(mediaId, index) in mediaIds"
        :key="mediaId"
        type="button"
        class="photo-button"
        :aria-label="'Open photo ' + (index + 1) + ' of ' + mediaIds.length"
        data-testid="evidence-photo"
        @click="open(index)"
      >
        <MediaThumb :media-id="mediaId" :alt="'Photo ' + (index + 1)" />
      </button>
    </div>

    <div v-for="video in videos" :key="video.link" class="mb-3">
      <div v-if="video.id" class="video-frame">
        <iframe
          :src="'https://www.youtube-nocookie.com/embed/' + video.id"
          title="Practice video"
          loading="lazy"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowfullscreen
        ></iframe>
      </div>
      <a v-else :href="video.link" target="_blank" rel="noopener noreferrer" class="video-link" data-testid="evidence-link">
        <span aria-hidden="true">🎬</span>
        <span class="text-truncate">Watch video on {{ hostOf(video.link) }}</span>
        <span aria-hidden="true">↗</span>
      </a>
    </div>

    <p v-if="!note && !mediaIds.length && !links.length" class="text-muted small mb-0">Nothing was attached.</p>

    <div v-if="bigIndex >= 0" class="lightbox" role="dialog" aria-modal="true" aria-label="Photo" @click.self="close">
      <button type="button" class="btn-close btn-close-white close" aria-label="Close photo" @click="close"></button>
      <img v-if="bigSrc" :src="bigSrc" :alt="'Photo ' + (bigIndex + 1)" />
      <span v-else class="spinner-border text-light" role="status"><span class="visually-hidden">Loading</span></span>
    </div>
  </div>
</template>

<style scoped>
.note {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  padding: 12px 14px;
  border-left: 3px solid var(--k-brand);
  background: var(--k-surface-alt);
  border-radius: 0 10px 10px 0;
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
}

.photo-button {
  padding: 0;
  border: none;
  background: none;
  border-radius: 12px;
  transition: transform 0.2s ease;
}

.photo-button:hover {
  transform: scale(1.02);
}

.photo-button:focus-visible {
  outline: 3px solid var(--k-brand);
  outline-offset: 2px;
}

.video-frame {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 12px;
  overflow: hidden;
  background: #000;
}

.video-frame iframe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
}

.video-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid var(--k-border);
  border-radius: 12px;
  background: var(--k-surface);
  font-weight: 600;
  text-decoration: none;
  max-width: 100%;
}

.video-link:hover {
  border-color: var(--k-brand);
}

.lightbox {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(20, 16, 11, 0.88);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.lightbox img {
  max-width: 100%;
  max-height: 100%;
  border-radius: 8px;
  object-fit: contain;
}

.close {
  position: absolute;
  top: 16px;
  right: 16px;
}

@media (prefers-reduced-motion: reduce) {
  .photo-button { transition: none; }
}
</style>
