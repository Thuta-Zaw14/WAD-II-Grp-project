import { createRouter, createWebHistory } from 'vue-router'
import axios from 'axios'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../firebase'

import LoginPage from '../view/LoginPage.vue'
import HomePage from '../view/HomePage.vue'
import SessionsPage from '../view/SessionsPage.vue'
import InsightsPage from '../view/Insightspage.vue'

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/',
            redirect: '/login'
        },

        {
            path: '/login',
            component: LoginPage
        },

        {
            path: '/home',
            component: HomePage,
            meta: {
                requiresAuth: true
            }
        },

        {
            path: '/sessions',
            component: SessionsPage,
            meta: {
                requiresAuth: true
            }
        },

        {
            path: '/admin',
            component: AdminPage,
            meta: {
                requiresAdmin: true
            }
        },

        {
            path: '/admin/users/:uid',
            component: AdminUserProfilePage,
            meta: {
                requiresAdmin: true
            }
        },
        {   path: '/insights', 
            component: InsightsPage,
            meta: {
            requiresAuth: true
        }
        },
    ]
})

function getCurrentUser() {
    return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(
            auth,
            user => {
                unsubscribe()
                resolve(user)
            },
            reject
        )
    })
}

router.beforeEach(async (to, from, next) => {

    const user = await getCurrentUser()

    // Admin routes
    if (to.meta.requiresAdmin) {

        if (!user) {
            return next('/login')
        }

        try {

            const token = await user.getIdToken()

            await axios.get(
                '/api/admins/users',
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            )

            return next()

        } catch (error) {

            if (error.response?.status === 403) {
                return next('/home')
            }

            return next('/login')
        }
    }

    // Normal protected pages
    if (to.meta.requiresAuth && !user) {
        return next('/login')
    }

    next()
}
)
export default router