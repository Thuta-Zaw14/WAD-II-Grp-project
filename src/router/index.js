import { createRouter, createWebHistory } from 'vue-router'
import LoginPage from '../view/LoginPage.vue'
import HomePage from '../view/HomePage.vue'
import SessionsPage from '../view/SessionsPage.vue'
import ProfilePage from '../view/ProfilePage.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', component: LoginPage },
    { path: '/home', component: HomePage },
    { path: '/sessions', component: SessionsPage },
    { path: '/profile', component: ProfilePage }
  ],
})

export default router