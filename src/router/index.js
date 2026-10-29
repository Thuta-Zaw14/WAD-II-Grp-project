import { createRouter, createWebHistory } from 'vue-router'
import axios from 'axios'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../firebase'

import LoginPage from '../view/LoginPage.vue'
import HomePage from '../view/HomePage.vue'
import SessionsPage from '../view/SessionsPage.vue'
import AdminPage from '../view/AdminPage.vue'
import AdminUserProfilePage from '../view/AdminUserProfilePage.vue'
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
            path: '/admins',
            component: AdminPage,
            meta: {
                requiresAdmin: true
            }
        },

        {
            path: '/admins/users/:uid',
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

router.beforeEach(async (to) => {
    const requiresAdmin = to.matched.some(
        record => record.meta.requiresAdmin
    )

    const requiresAuth = to.matched.some(
        record => record.meta.requiresAuth
    )

    let user

    try {
        user = await getCurrentUser()
    } catch (error) {
        console.error('Firebase auth check failed:', error)

        return (requiresAdmin || requiresAuth)
            ? '/login'
            : true
    }

    // Must be logged in for protected pages
    if ((requiresAdmin || requiresAuth) && !user) {
        return '/login'
    }

    // Must pass backend admin verification
    if (requiresAdmin) {
        try {
            const token = await user.getIdToken()

            const response = await axios.get('/api/admins/check', {
                headers: {
                    Authorization: `Bearer ${token}`
                }
                
            })
            console.log(response)
            return true
        } catch (error) {
            console.error(
                'Admin verification failed:',
                error.response?.status,
                error.response?.data || error.message
            )

            if (error.response?.status === 403) {
                return '/home'
            }

            if (error.response?.status === 401) {
                return '/login'
            }

            // Fail closed if the server cannot verify access
            return '/home'
        }
    }

    return true
})
export default router