import { createApp } from 'vue'
import { createPinia } from 'pinia'

import 'bootstrap/dist/css/bootstrap.min.css'
import './assets/theme.css'
import { onAuthStateChanged } from 'firebase/auth'
import App from './App.vue'
import router from './router'
import { auth } from './firebase'
import { useProfileStore } from './stores/profile'
import { useOffersStore } from './stores/offers'
import { useBookingsStore } from './stores/bookings'

const app = createApp(App)

app.use(createPinia())
app.use(router)

// Whenever the signed-in person changes (any logout, or another account logging in on this tab)
// forget every store, so nobody sees the previous person's profile, bookings or courses.
let lastUid // undefined until Firebase has told us who is signed in for the first time
onAuthStateChanged(auth, (user) => {
  const uid = user ? user.uid : null
  if (lastUid !== undefined && uid !== lastUid) {
    useProfileStore().reset()
    useOffersStore().reset()
    useBookingsStore().reset()
  }
  lastUid = uid
})

app.mount('#app')
