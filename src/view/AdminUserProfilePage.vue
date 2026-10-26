
<script setup>
import { onMounted, ref } from 'vue'
import axios from 'axios'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const inputReason = ref(false)
const warningReason = ref('')
const submitting = ref(false)
const actionMessage = ref('')
const actionError = ref('')
const user = ref([])

async function viewUser(firebaseUid) {
    router.push('/admin/users/' + firebaseUid)
    await loadUser(firebaseUid)
}

async function loadUser(firebaseUid) {
    try {
        const response = await axios.get('/api/admins/users/' + firebaseUid)
        user.value = response.data
    } catch (error) {
        console.log(error)
    }
}

function formatDate(date) {
    const d = new Date(date)

    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()

    return `${day}/${month}/${year}`
}

async function banUsers(firebaseUid) {
    if (submitting.value) return

    if (!window.confirm('Are you sure you want to ban this user?')) {
        return
    }

    submitting.value = true
    actionError.value = ''
    actionMessage.value = ''

    try {
        await axios.put('/api/admins/users/ban', {
            firebaseUid,
            isBanned: true
        })

        user.value.isBanned = true
        actionMessage.value = 'User banned successfully.'
    } catch (error) {
        actionError.value =
            error.response?.data?.message || 'Failed to ban user.'
    } finally {
        submitting.value = false
    }
}

async function unbanUsers(firebaseUid) {
    if (submitting.value) return

    if (!window.confirm('Are you sure you want to unban this user?')) {
        return
    }

    submitting.value = true
    actionError.value = ''
    actionMessage.value = ''

    try {
        await axios.put('/api/admins/users/unban', {
            firebaseUid,
            isBanned: false
        })

        user.value.isBanned = false
        actionMessage.value = 'User unbanned successfully.'
    } catch (error) {
        actionError.value =
            error.response?.data?.message || 'Failed to unban user.'
    } finally {
        submitting.value = false
    }
}

async function issueWarning() {
    const reason = warningReason.value.trim()

    if (!reason) {
        actionError.value = 'Please enter a warning reason.'
        return
    }

    if (submitting.value) return

    submitting.value = true
    actionError.value = ''
    actionMessage.value = ''

    try {
        const response = await axios.post('/api/admins/users/warn', {
            firebaseUid: user.value.firebaseUid,
            warning: reason
        })

        const savedWarning = response.data.warning || {
            reason,
            createdAt: new Date().toISOString()
        }

        user.value.warnings.unshift(savedWarning)

        actionMessage.value = 'Warning issued successfully.'
        warningReason.value = ''
        inputReason.value = false
    } catch (error) {
        actionError.value =
            error.response?.data?.message || 'Failed to issue warning.'
    } finally {
        submitting.value = false
    }
}

    onMounted(() => {
        loadUser(route.params.uid)
    })

</script>

<template>
    <div class="profile-page">
        <div class="container py-4">

            <!-- Back button -->
            <button
                class="btn back-btn mb-4"
                @click="router.push('/admin')"
            >
                ← Back to Dashboard
            </button>

            <h1 class="page-title mb-4">
                User Profile
            </h1>

            <!-- User Information and Admin Actions -->
            <div class="card custom-card mb-4">
                <div class="card-body">

                    <h2 class="user-name mb-4">
                        {{ user.name }}
                    </h2>

                    <div class="row">
                        <div class="col-md-6">
                            <p>
                                <strong>Email:</strong>
                                {{ user.email }}
                            </p>

                            <p>
                                <strong>Firebase UID:</strong>
                                {{ user.firebaseUid }}
                            </p>

                            <p>
                                <strong>Credits:</strong>
                                {{ user.credits }}
                            </p>
                        </div>

                        <div class="col-md-6">
                            <p>
                                <strong>Total Reports:</strong>
                                {{ user.numberOfReports }}
                            </p>

                            <p>
                                <strong>Status: </strong>

                                <span
                                    :class="user.isBanned
                                        ? 'status-banned'
                                        : 'status-active'"
                                >
                                    {{ user.isBanned ? 'Banned' : 'Active' }}
                                </span>
                            </p>

                            <p>
                                <strong>Admin:</strong>
                                {{ user.isAdmin ? 'Yes' : 'No' }}
                            </p>
                        </div>
                    </div>

                    <!-- Admin Actions at the Top -->
                    <hr class="my-4">

                    <h4 class="section-title">
                        Admin Actions
                    </h4>

                    <p class="text-muted">
                        Manage this user's account and warnings.
                    </p>

                    <div
                        v-if="actionMessage"
                        class="alert alert-success"
                        role="status"
                    >
                        {{ actionMessage }}
                    </div>

                    <div
                        v-if="actionError"
                        class="alert alert-danger"
                        role="alert"
                    >
                        {{ actionError }}
                    </div>

                    <div class="d-flex flex-wrap gap-2">

                        <!-- Warn -->
                        <button
                            type="button"
                            class="btn btn-warning"
                            :disabled="submitting"
                            @click="
                                inputReason = !inputReason;
                                actionError = ''
                            "
                        >
                            {{ inputReason ? 'Cancel Warning' : 'Warn User' }}
                        </button>

                        <!-- Ban -->
                        <button
                            v-if="!user.isBanned"
                            type="button"
                            class="btn btn-danger"
                            :disabled="submitting"
                            @click="banUsers(user.firebaseUid)"
                        >
                            {{ submitting ? 'Processing...' : 'Ban User' }}
                        </button>

                        <!-- Unban -->
                        <button
                            v-else
                            type="button"
                            class="btn btn-success"
                            :disabled="submitting"
                            @click="unbanUsers(user.firebaseUid)"
                        >
                            {{ submitting ? 'Processing...' : 'Unban User' }}
                        </button>
                    </div>

                    <!-- Warning Form -->
                    <form
                        v-if="inputReason"
                        class="warning-form mt-4"
                        @submit.prevent="issueWarning"
                    >
                        <label
                            for="warningReason"
                            class="form-label fw-semibold"
                        >
                            Warning Reason
                        </label>

                        <textarea
                            id="warningReason"
                            v-model="warningReason"
                            class="form-control"
                            rows="3"
                            maxlength="1000"
                            placeholder="Please enter a warning reason..."
                            required
                        ></textarea>

                        <div class="form-text">
                            Provide a clear reason for issuing this warning.
                        </div>

                        <button
                            type="submit"
                            class="btn submit-warning-btn mt-3"
                            :disabled="submitting || !warningReason.trim()"
                        >
                            {{ submitting ? 'Submitting...' : 'Submit Warning' }}
                        </button>
                    </form>

                </div>
            </div>

            <!-- Skills -->
            <div class="card custom-card mb-4">
                <div class="card-body">

                    <h4 class="section-title">
                        Skills Teaching
                    </h4>

                    <div class="mb-3">
                        <span
                            v-for="skill in user.skillsTeach"
                            :key="skill"
                            class="skill-badge teach"
                        >
                            {{ skill }}
                        </span>
                    </div>

                    <h4 class="section-title">
                        Skills Learning
                    </h4>

                    <div>
                        <span
                            v-for="skill in user.skillsLearn"
                            :key="skill"
                            class="skill-badge learn"
                        >
                            {{ skill }}
                        </span>
                    </div>

                </div>
            </div>

            <!-- Warning History -->
            <div class="card custom-card mb-4">
                <div class="card-body">

                    <h4 class="section-title">
                        Warning History
                    </h4>

                    <div class="table-responsive">
                        <table class="table align-middle">
                            <thead>
                                <tr>
                                    <th>Warning</th>
                                    <th>Date Issued</th>
                                </tr>
                            </thead>

                            <tbody>
                                <tr
                                    v-for="(warning, index) in user.warnings"
                                    :key="warning.id || warning.createdAt + index"
                                >
                                    <td>{{ warning.reason }}</td>
                                    <td>{{ formatDate(warning.createdAt) }}</td>
                                </tr>

                                <tr v-if="user.warnings.length === 0">
                                    <td
                                        colspan="2"
                                        class="text-center text-muted py-4"
                                    >
                                        No warnings issued to this user.
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                </div>
            </div>

            <!-- Report History -->
            <div class="card custom-card mb-4">
                <div class="card-body">

                    <h4 class="section-title">
                        Report History
                    </h4>

                    <div class="table-responsive">
                        <table class="table align-middle">
                            <thead>
                                <tr>
                                    <th>Reporter</th>
                                    <th>Email</th>
                                    <th>Reason</th>
                                    <th>Date</th>
                                </tr>
                            </thead>

                            <tbody>
                                <tr
                                    v-for="report in user.reports"
                                    :key="report.reportId"
                                >
                                    <td>
                                        <button
                                            class="btn btn-link p-0 reporter-link"
                                            @click="viewUser(report.reporterUid)"
                                        >
                                            {{ report.reporterName }}
                                        </button>
                                    </td>

                                    <td>{{ report.reporterEmail }}</td>
                                    <td>{{ report.reason }}</td>
                                    <td>{{ formatDate(report.createdAt) }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                </div>
            </div>

        </div>
    </div>
</template>

<style scoped>
.profile-page {
    background: #eae7df;
    min-height: 100vh;
}

.page-title {
    color: #4a3f35;
    font-weight: 700;
}

.user-name {
    color: #4a3f35;
}

.custom-card {
    border: none;
    border-radius: 20px;
    background: white;
    box-shadow: 0 5px 20px rgba(0, 0, 0, 0.08);
}

.section-title {
    color: #4a3f35;
    font-weight: 600;
    margin-bottom: 1rem;
}

.back-btn {
    background: #bb8860;
    color: white;
    border: none;
}

.back-btn:hover {
    background: #a56f47;
    color: white;
}

.skill-badge {
    margin-right: 8px;
    margin-bottom: 8px;
    padding: 6px 12px;
    border-radius: 15px;
    display: inline-block;
}

.teach {
    background: #bb8860;
    color: white;
}

.learn {
    background: #e2ddd0;
    color: #4a3f35;
}

.status-active {
    color: green;
    font-weight: bold;
}

.status-banned {
    color: #dc3545;
    font-weight: bold;
}

.reporter-link {
    color: #bb8860;
    text-decoration: none;
    font-weight: 600;
}

.reporter-link:hover {
    color: #a56f47;
    text-decoration: underline;
}

.warning-form {
    max-width: 600px;
}

.submit-warning-btn {
    background: #4a3f35;
    color: white;
    border: none;
}

.submit-warning-btn:hover {
    background: #332b25;
    color: white;
}

table th {
    background: #e2ddd0;
    color: #4a3f35;
}
</style>
