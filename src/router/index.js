import { createRouter, createWebHistory } from 'vue-router'
import LoginPage from '../view/LoginPage.vue'
import HomePage from '../view/HomePage.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', component: LoginPage },
    { path: '/home', component: HomePage },
  ],
})

export default router