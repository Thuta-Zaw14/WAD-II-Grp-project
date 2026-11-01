import { createRouter, createWebHistory } from 'vue-router'
import LoginPage from '../view/LoginPage.vue'
import HomePage from '../view/HomePage.vue'
import SessionsPage from '../view/SessionsPage.vue'
import InsightsPage from '@/view/Insightspage.vue'
import ProfilePage from '../view/ProfilePage.vue'
import TeachSkillPage from '../view/TeachSkillPage.vue'
import LearnSkillPage from '../view/LearnSkillPage.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', component: LoginPage },
    { path: '/home', component: HomePage },
    { path: '/sessions', component: SessionsPage },
    { path: '/insights', component: InsightsPage },
    { path: '/profile', component: ProfilePage },
    // props: true hands the :id in the address to the page as a prop
    { path: '/teach/new', component: TeachSkillPage },
    { path: '/teach/:id', component: TeachSkillPage, props: true },
    { path: '/learn/new', component: LearnSkillPage },
    { path: '/learn/:id', component: LearnSkillPage, props: true },
  ],
})

export default router