<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'

const router = useRouter()

const users = ref([])

async function logout() {
    try {
        await signOut(auth)
        router.push('/login')
    } catch (error) {
        console.log(error)
    }
}

async function loadUsers() {
    try {
        const token = await auth.currentUser?.getIdToken()

        const response = await axios.get(
            '/api/admins/users',
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        )

        users.value = response.data

    } catch (error) {

        if (error.response?.status === 403) {
            alert('Admin access required')
            router.push('/')
        }

        console.log(error)
    }
}

function showUserProfile(firebaseUid) {
    router.push('/admins/users/' + firebaseUid)
}

function formatDate(date) {
    if (!date) return '-'

    return new Date(date).toLocaleDateString('en-SG')
}

const totalReports = computed(() =>
    users.value.reduce(
        (sum, user) => sum + (Number(user.numberOfReports) || 0),
        0
    )
)

const bannedUsers = computed(() =>
    users.value.filter(user => user.isBanned).length
)

onMounted(() => {
    loadUsers()
})
</script>

<template>
    <div class="admin-page">

        <div class="d-lg-none">
            <div class="container py-5">
                <div class="alert alert-warning text-center">
                    This admin dashboard is only available on desktop devices.
                </div>
            </div>
        </div>

        <div class="container py-4 d-none d-lg-block">

            <div
                style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                "
            >
                <h1 class="page-title mb-4">
                    User Management
                </h1>

                <button
                    class="btn btn-danger btn-sm"
                    @click="logout"
                >
                    Log Out
                </button>
            </div>

            <div class="row mb-4">

                <div class="col-4">
                    <div class="stat-card">
                        <h6>Total Users</h6>
                        <h3>{{ users.length }}</h3>
                    </div>
                </div>

                <div class="col-4">
                    <div class="stat-card">
                        <h6>Total Reports</h6>
                        <h3>{{ totalReports }}</h3>
                    </div>
                </div>

                <div class="col-4">
                    <div class="stat-card">
                        <h6>Banned Accounts</h6>
                        <h3>{{ bannedUsers }}</h3>
                    </div>
                </div>

            </div>

            <div class="card custom-card">
                <div class="card-body">

                    <table class="table align-middle">

                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Credits</th>
                                <th>Reports</th>
                                <th>Joined</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>

                        <tbody>

                            <tr
                                v-for="user in users"
                                :key="user.firebaseUid"
                                :class="{
                                    'report-warning':
                                        user.numberOfReports >= 3 &&
                                        user.numberOfReports < 5,

                                    'report-danger':
                                        user.numberOfReports >= 5,

                                    'table-danger':
                                        user.isBanned
                                }"
                            >
                                <td>
                                    {{ user.name }}
                                </td>

                                <td>
                                    {{ user.email }}
                                </td>

                                <td>
                                    {{ user.credits }}
                                </td>

                                <td>
                                    <span
                                        class="badge"
                                        :class="{
                                            'bg-success':
                                                user.numberOfReports === 0,

                                            'bg-warning text-dark':
                                                user.numberOfReports > 0 &&
                                                user.numberOfReports < 3,

                                            'bg-danger':
                                                user.numberOfReports >= 3
                                        }"
                                    >
                                        {{ user.numberOfReports }}
                                    </span>
                                </td>

                                <td>
                                    {{ formatDate(user.createdAt) }}
                                </td>

                                <td>
                                    {{ user.isBanned ? 'Banned' : 'Active' }}
                                </td>

                                <td>
                                    <button
                                        class="btn btn-info btn-sm"
                                        @click="
                                            showUserProfile(
                                                user.firebaseUid
                                            )
                                        "
                                    >
                                        View
                                    </button>
                                </td>

                            </tr>

                        </tbody>

                    </table>

                </div>
            </div>

        </div>

    </div>
</template>

<style scoped>
.admin-page {
    background: #eae7df;
    min-height: 100vh;
}

.page-title {
    color: #4a3f35;
    font-weight: 700;
}

.custom-card {
    border: none;
    border-radius: 20px;
    background: white;
    box-shadow: 0 5px 20px rgba(0, 0, 0, 0.08);
}

.stat-card {
    background: white;
    border-radius: 20px;
    padding: 1.5rem;
    text-align: center;
    box-shadow: 0 3px 15px rgba(0, 0, 0, 0.08);
}

.stat-card h6 {
    color: #7f7567;
}

.stat-card h3 {
    color: #bb8860;
    font-weight: bold;
}

table th {
    background: #e2ddd0;
    color: #4a3f35;
}

.report-warning {
    background-color: #fff8dd !important;
}

.report-danger {
    background-color: #fde2e2 !important;
}

tbody tr:hover {
    background-color: #f7f3ec;
}

.desktop-warning {
    background: #e2ddd0;
    color: #4a3f35;
    padding: 20px;
    border-radius: 15px;
    text-align: center;
    font-weight: 600;
}
</style>