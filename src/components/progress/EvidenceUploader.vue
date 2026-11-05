<script setup>
import { ref, computed } from 'vue'
import { compressImage } from '@/services/imageCompress'
import MediaThumb from './MediaThumb.vue'

// The student's "show your progress" box: photos (made small in the browser before they are
// sent) and up to two video links. Photos already saved are { mediaId }; new ones are { dataUrl }.
const photos = defineModel('photos', { type: Array, default: () => [] })
const links = defineModel('links', { type: Array, default: () => [''] })
const props = defineProps({
  maxPhotos: { type: Number, default: 4 },
  maxLinks: { type: Number, default: 2 },
})

const error = ref('')
const working = ref(false)
const fileInput = ref(null)
const full = computed(() => photos.value.length >= props.maxPhotos)

async function onPick(event) {
  error.value = ''
  const files = [...event.target.files]
  event.target.value = '' // so the same photo can be picked again after removing it
  working.value = true
  const next = [...photos.value]
  for (const file of files) {
    if (next.length >= props.maxPhotos) {
      error.value = 'You can attach up to ' + props.maxPhotos + ' photos.'
      break
    }
    try {
      next.push({ dataUrl: await compressImage(file), name: file.name })
    } catch (err) {
      error.value = err.message
    }
  }
  photos.value = next
  working.value = false
}

function removePhoto(index) {
  photos.value = photos.value.filter((_, i) => i !== index)
}

function addLink() {
  if (links.value.length < props.maxLinks) links.value = [...links.value, '']
}

function setLink(index, value) {
  const next = [...links.value]
  next[index] = value
  links.value = next
}

function removeLink(index) {
  const next = links.value.filter((_, i) => i !== index)
  links.value = next.length ? next : ['']
}
</script>

<template>
  <div class="uploader">
    <div class="d-flex justify-content-between align-items-baseline flex-wrap gap-2 mb-2">
      <span class="form-label mb-0" id="photos-label">Photos of your practice</span>
      <small class="text-muted">{{ photos.length }}/{{ maxPhotos }}</small>
    </div>

    <div class="photo-grid mb-2">
      <div v-for="(photo, index) in photos" :key="photo.mediaId || photo.dataUrl.slice(-40) + index" class="photo">
        <MediaThumb :media-id="photo.mediaId" :data-url="photo.dataUrl" :alt="'Photo ' + (index + 1)" />
        <button
          type="button"
          class="remove"
          :aria-label="'Remove photo ' + (index + 1)"
          data-testid="remove-photo"
          @click="removePhoto(index)"
        >×</button>
      </div>

      <label
        v-if="!full"
        class="add-photo"
        :class="{ busy: working }"
        aria-labelledby="photos-label"
      >
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          multiple
          class="visually-hidden"
          data-testid="photo-input"
          :disabled="working"
          @change="onPick"
        />
        <span v-if="working" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
        <span v-else class="plus" aria-hidden="true">＋</span>
        <span class="small">{{ working ? 'Preparing...' : 'Add photos' }}</span>
      </label>
    </div>

    <label class="form-label mt-2" for="video-link-0">Video links <span class="text-muted small">(optional)</span></label>
    <p class="small text-muted mb-2">
      Upload your video to YouTube (unlisted is fine) or Google Drive and paste the link. YouTube videos play right here.
    </p>
    <div v-for="(link, index) in links" :key="index" class="input-group mb-2">
      <span class="input-group-text" aria-hidden="true">🎬</span>
      <input
        :id="'video-link-' + index"
        type="url"
        class="form-control"
        :value="link"
        placeholder="https://youtu.be/..."
        inputmode="url"
        :aria-label="'Video link ' + (index + 1)"
        :data-testid="'video-link-' + index"
        @input="setLink(index, $event.target.value)"
      />
      <button type="button" class="btn btn-outline-secondary" :aria-label="'Remove video link ' + (index + 1)" @click="removeLink(index)">×</button>
    </div>
    <button v-if="links.length < maxLinks" type="button" class="link-button small" @click="addLink">+ Add another link</button>

    <div v-if="error" class="text-danger small mt-2" role="alert" data-testid="uploader-error">{{ error }}</div>
  </div>
</template>

<style scoped>
.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
  gap: 10px;
}

.photo {
  position: relative;
  aspect-ratio: 1;
}

.remove {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 50%;
  background: rgba(35, 29, 21, 0.75);
  color: #fff;
  line-height: 1;
}

.add-photo {
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 2px dashed var(--k-border);
  border-radius: 12px;
  background: var(--k-surface);
  color: var(--k-brand);
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.add-photo:hover,
.add-photo:focus-within {
  border-color: var(--k-brand);
  background: #fffaf2;
}

.add-photo.busy {
  cursor: progress;
}

.plus {
  font-size: 24px;
  line-height: 1;
}
</style>
