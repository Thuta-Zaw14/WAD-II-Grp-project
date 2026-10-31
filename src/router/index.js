import { createRouter, createWebHistory } from 'vue-router'
import LoginPage from '../view/LoginPage.vue'
import HomePage from '../view/HomePage.vue'
import SessionsPage from '../view/SessionsPage.vue'
import ProfilePage from '../view/ProfilePage.vue'
import TeachSkillPage from '../component/TeachSkillPage.vue'
import LearnSkillPage from '../component/LearnSkillPage.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', component: LoginPage },
    { path: '/home', component: HomePage },
    { path: '/sessions', component: SessionsPage },
    { path: '/profile', component: ProfilePage },
    { path: '/skills/teach/new', component: TeachSkillPage },
    { path: '/skills/teach/:id/edit', component: TeachSkillPage, props: true },
    { path: '/skills/learn/new', component: LearnSkillPage },
    { path: '/skills/learn/:id/edit', component: LearnSkillPage, props: true }
  ],
})

export default router