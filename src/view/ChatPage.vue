<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { auth } from '../firebase'
import BookingChat from '../components/BookingChat.vue'

// The private chat of one booking, at /chat/<booking id>. The id in the address arrives as a prop
// (the route has props: true). The chat itself is the BookingChat component; this page adds the
// header: which course it is about, who it is with, and a way back.
const props = defineProps({
  id: { type: String, required: true },
})

const router = useRouter()
const ready = ref(false) // true once Firebase has restored the login

onMounted(async () => {
  await auth.authStateReady() // after a refresh Firebase needs a moment to restore the login
  if (!auth.currentUser) {
    router.push('/login')
    return
  }
  ready.value = true
})

// the header info comes with the first load of the chat (see BookingChat.vue)
const info = ref(null) // { title, role, otherName, status }

const statusLabels = {
  booked: 'Booked',
  finished: 'Finished',
  cancelled: 'Cancelled',
  disputed: 'Under review',
}

const statusColors = {
  booked: 'text-bg-info',
  finished: 'text-bg-success',
  cancelled: 'text-bg-secondary',
  disputed: 'text-bg-danger',
}

const heading = computed(() => (info.value ? 'Chat with ' + info.value.otherName : 'Chat'))

function goBack() {
  router.push('/sessions')
}
</script>

<template>
  <nav class="navbar border-bottom px-3">
    <span class="navbar-brand fw-bold">Kongsi</span>
    <span class="text-dark" role="button" @click="goBack">Back to My sessions</span>
  </nav>

  <div class="container py-4 chat-container">
    <div class="p-4 mb-3 rounded banner">
      <h1 class="h4 mb-1">{{ heading }}</h1>
      <p v-if="info" class="mb-0">
        {{ info.title }}
        <span class="badge ms-2" :class="statusColors[info.status]">{{ statusLabels[info.status] }}</span>
      </p>
      <p v-else class="mb-0">Only you and the other person can see this chat.</p>
    </div>

    <BookingChat
      v-if="ready"
      :booking-id="props.id"
      :other-name="info ? info.otherName : ''"
      @loaded="(booking) => (info = booking)"
    />
  </div>
</template>

<style scoped>
.banner {
  background: #f5f0e1;
  color: #4a3f2a;
}

/* a chat reads better in a column than stretched across a wide screen */
.chat-container {
  max-width: 760px;
}
</style>
