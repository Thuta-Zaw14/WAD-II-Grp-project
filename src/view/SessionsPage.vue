<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { getSessions } from '../../server/models/Sessions'
const router = useRouter()

// Fake data for now
const sessions = ref([
  { id: 1, skill: 'Tennis', teacher: 'Alex T.', category: 'Sports', status: 'Pending' },
  { id: 2, skill: 'Guitar basics', teacher: 'Daniel K.', category: 'Music', status: 'Finished' },
  { id: 3, skill: 'Python intro', teacher: 'Sara R.', category: 'Tech', status: 'Pending' },
])

function toggleStatus(s) {
  if (s.status === 'Pending') {
  s.status = 'Finished'}
  else {
  s.status = 'Pending'
}
}


function removeSession(id) {
    const updatedSessions = []

    for (const s of sessions.value) {
    if (s.id !== id) {
        updatedSessions.push(s)
    }
    }

    sessions.value = updatedSessions
}

function goHome() {
  router.push('/home')
}

</script>

<template>
  <nav class="navbar border-bottom px-3">
    <span class="navbar-brand fw-bold">Kongsi</span>
    <span class="text-dark" role="button" @click="getSessions">Back to home</span>
  </nav>

  <div class="container py-4">
    <div class="p-4 mb-4 rounded banner">
      <h1 class="h4 mb-1">My sessions</h1>
      <p class="mb-0">Track the sessions you've requested. Click a status to update it.</p>
    </div>

    <div class="row g-3">
      <div v-for="s in sessions" :key="s.id" class="col-12 col-sm-6 col-lg-4">
        <div class="card h-100">
          <div class="card-body">
            <span class="badge text-bg-light mb-2">{{ s.category }}</span>
            <h2 class="h5">{{ s.skill }}</h2>
            <p class="text-muted mb-3">Taught by {{ s.teacher }}</p>

            <div class="d-flex justify-content-between align-items-center">
              <span
                class="badge"
                :class="s.status === 'Finished' ? 'text-bg-success' : 'text-bg-warning'"
                role="button"
                @click="toggleStatus(s)"
              >
                {{ s.status }}
              </span>
              <span class="text-danger small" role="button" @click="removeSession(s.id)">
                Delete
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <p v-if="sessions.length === 0" class="text-muted">No sessions yet.</p>
  </div>
</template>

<style scoped>
.banner {
  background: #f5f0e1;
  color: #4a3f2a;
}
</style>