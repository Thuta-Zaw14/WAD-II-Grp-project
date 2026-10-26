<script setup>
    import { ref, computed, onMounted } from "vue";
    import { useRouter } from 'vue-router'
    import axios from "axios";

    const router = useRouter()

    const users = ref([])

    // Data from backend 
    async function loadUsers() {
        try {
            const response = await axios.get('/api/admins/users')
            users.value = response.data
        } catch (error) {
            console.log(error)
        }
    }

    onMounted(() => {
        loadUsers();
    });

    const totalReports = computed(() =>
        users.value.reduce(
            (sum, user) => sum + (Number(user.numberOfReports) || 0),
            0
        )
    )

    const bannedUsers = computed(() =>
        users.value.filter(user => user.isBanned).length
    )

    function showUserProfile(firebaseUid) {
        router.push('/admins/users/' + firebaseUid)
    }

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
        
        <div style="display: flex; flex-direction: row; justify-content: space-between;">
        <h1 class="page-title mb-4">
            User Management
        </h1>

        <button class="btn btn-danger btn-sm">
            Log out
        </button>
        </div>
        <!-- <h1 class="page-title mb-4">
            User Management
        </h1>

        <button>
            Log out
        </button> -->

        <!-- Statistics -->
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
                <h6>Banned accounts</h6>
                <h3>{{ bannedUsers }}</h3>
            </div>
            </div>

        </div>

        <!-- User Table -->
        <div class="card custom-card d-none d-lg-block">
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
                    'report-warning': user.numberOfReports >= 3 && user.numberOfReports < 5,
                    'report-danger': user.numberOfReports >= 5, 
                    'table-danger': user.isBanned
                    }"
                >
                    <td>{{ user.name }}</td>

                    <td>{{ user.email }}</td>

                    <td style="padding-left: 30px;">
                    <span>
                        {{ user.credits }}
                    </span>
                    </td>

                    <td style="padding-left: 29px; padding-right: 29px;">
                    <span
                        class="badge"
                        :class="{
                        'bg-success': user.numberOfReports === 0,
                        'bg-warning text-dark': user.numberOfReports > 0 && user.numberOfReports < 3,
                        'bg-danger': user.numberOfReports >= 3
                        }"
                    >
                        {{ user.numberOfReports }}
                    </span>
                    </td>

                    <td>
                    {{ formatDate(user.createdAt) }}
                    </td>

                    <td>
                        {{ user.isBanned ?  'Banned' : 'Active' }}
                    </td>

                    <td>
                    <button
                        class="btn btn-info btn-sm me-2"
                        @click="showUserProfile(user.firebaseUid)"
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
    box-shadow: 0 5px 20px rgba(0,0,0,0.08);
    }

    .stat-card {
    background: white;
    border-radius: 20px;
    padding: 1.5rem;
    text-align: center;
    box-shadow: 0 3px 15px rgba(0,0,0,0.08);
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

    .credit-badge {
    background: #bb8860;
    color: white;
    padding: 6px 12px;
    border-radius: 20px;
    }

    .skill-badge {
    margin-bottom: 5px;
    padding: 5px 10px;
    border-radius: 15px;
    display: inline-block;
    font-size: 0.8rem;
    }

    .teach {
    background: #bb8860;
    color: white;
    }

    .learn {
    background: #e2ddd0;
    color: #4a3f35;
    }

    .report-warning {
    background-color: #fff8dd !important;
    }

    .report-danger {
    background-color: #fde2e2 !important;
    }

    .warn-btn {
    background: #bb8860;
    color: white;
    border: none;
    }

    .warn-btn:hover {
    background: #a56f47;
    color: white;
    }

    .remove-btn {
    background: #dc3545;
    color: white;
    border: none;
    }

    .remove-btn:hover {
    background: #b02a37;
    color: white;
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