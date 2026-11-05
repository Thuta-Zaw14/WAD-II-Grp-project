<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { auth } from '../firebase'
import LogoMark from '../components/LogoMark.vue'

// Shown for any address that is not one of the app's pages (the last route in router/index.js),
// e.g. /profile/bob. It works whether or not someone is logged in.
const route = useRoute()
const loggedIn = ref(false)

onMounted(async () => {
  await auth.authStateReady() // wait until Firebase has restored the login
  loggedIn.value = auth.currentUser !== null
})
</script>

<template>
  <main class="not-found container d-flex align-items-center justify-content-center">
    <section class="k-card text-center p-4 p-md-5" aria-labelledby="not-found-title">
      <RouterLink to="/" class="brand d-inline-flex align-items-center gap-2 text-decoration-none mb-4">
        <LogoMark />
        Kongsi
      </RouterLink>

      <p class="code mb-1" aria-hidden="true">404</p>
      <h1 id="not-found-title" class="h3 mb-2">Page not found.</h1>
      <p class="text-muted mb-1">We couldn't find the page you were looking for.</p>
      <p class="small text-muted mb-4">
        <code>{{ route.fullPath }}</code> doesn't exist or has moved.
      </p>

      <RouterLink :to="loggedIn ? '/home' : '/'" class="btn btn-brand px-4">
        {{ loggedIn ? 'Go to Home' : 'Go to the start page' }}
      </RouterLink>
    </section>
  </main>
</template>

<style scoped>
.not-found {
  min-height: 100dvh;
  padding: 1rem;
}

.k-card {
  width: 100%;
  max-width: 440px;
}

.brand {
  font-family: var(--k-font-heading);
  font-size: 22px;
  font-weight: 700;
  color: var(--k-accent);
}

/* the big "404" above the heading */
.code {
  font-family: var(--k-font-heading);
  font-size: 3.5rem;
  font-weight: 700;
  line-height: 1;
  color: var(--k-brand);
}

.not-found h1 {
  color: var(--k-accent);
}

code {
  overflow-wrap: anywhere;
  color: var(--k-text);
}
</style>
