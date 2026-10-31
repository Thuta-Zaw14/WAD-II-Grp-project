<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { waitForUser } from '../services/currentUser'
import {
  ensureUserProfile,
  getPastSkillCards,
  updateUserProfile,
} from '../services/skills'
import SkillCard from '../component/SkillCard.vue'

const router = useRouter()
let uid = null

const profile = ref({
  name: '',
  bio: '',
  location: '',
  interests: [],
  skillsTeach: [],
  skillsLearn: [],
  credits: 0,
})

const skillCards = ref([])
const loading = ref(true)
const loadError = ref('')
const isSaving = ref(false)

const isEditing = ref(false)
const formError = ref('')
const draft = reactive({
  name: '',
  bio: '',
  location: '',
  interests: '',
})

const initials = computed(() =>
  profile.value.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase() || '')
    .join('') || '?'
)

function formatDate(value) {
  if (value?.toDate) value = value.toDate()
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return typeof value === 'string' ? value.slice(0, 10) : ''
}

async function loadProfile() {
  try {
    const user = await waitForUser()
    if (!user) {
      router.push('/login')
      return
    }

    uid = user.uid
    const userProfile = await ensureUserProfile(user)
    const cards = await getPastSkillCards(uid)

    profile.value = {
      name: userProfile.name || user.displayName || user.email?.split('@')[0] || 'Kongsi Member',
      bio: userProfile.bio || '',
      location: userProfile.location || '',
      interests: Array.isArray(userProfile.interests) ? userProfile.interests : [],
      skillsTeach: Array.isArray(userProfile.skillsTeach) ? userProfile.skillsTeach : [],
      skillsLearn: Array.isArray(userProfile.skillsLearn) ? userProfile.skillsLearn : [],
      credits: userProfile.credits ?? 0,
    }
    skillCards.value = cards.map((card) => ({
      ...card,
      name: card.name || card.title || card.skill || '',
      issuer: card.issuer || card.teacherName || card.teacher || '',
      dateAttained: formatDate(card.dateAttained || card.completedAt || card.createdAt),
      subskills: Array.isArray(card.subskills) ? card.subskills : [],
    }))
  } catch (error) {
    console.error('Could not load profile:', error)
    loadError.value = 'Could not load your profile. Please try again.'
  } finally {
    loading.value = false
  }
}

onMounted(loadProfile)

function skillEditPath(kind, title) {
  return `/skills/${kind}/${encodeURIComponent(title)}/edit`
}

function startEditing() {
  draft.name = profile.value.name
  draft.bio = profile.value.bio
  draft.location = profile.value.location
  draft.interests = profile.value.interests.join(', ')
  formError.value = ''
  isEditing.value = true
}

function cancelEditing() {
  isEditing.value = false
  formError.value = ''
}

function parseList(value) {
  return [...new Set(
    value.split(',')
      .map(item => item.trim())
      .filter(Boolean)
  )]
}

async function saveChanges() {
  const name = draft.name.trim()
  formError.value = ''

  if (!name) {
    formError.value = 'Please enter your name.'
    return
  }

  if (name.length > 100) {
    formError.value = 'Your name must be 100 characters or fewer.'
    return
  }

  if (draft.bio.length > 300) {
    formError.value = 'Your bio must be 300 characters or fewer.'
    return
  }

  if (draft.location.length > 100) {
    formError.value = 'Your location must be 100 characters or fewer.'
    return
  }

  const interests = parseList(draft.interests)

  if (interests.length > 15 || interests.some(item => item.length > 50)) {
    formError.value = 'Each list can contain up to 15 items, with 50 characters per item.'
    return
  }

  isSaving.value = true
  const updatedProfile = {
    name,
    bio: draft.bio.trim(),
    location: draft.location.trim(),
    interests,
  }

  try {
    await updateUserProfile(uid, updatedProfile)
    profile.value = { ...profile.value, ...updatedProfile }
    isEditing.value = false
  } catch (error) {
    console.error('Could not save profile:', error)
    formError.value = 'Could not save your profile. Please try again.'
  } finally {
    isSaving.value = false
  }
}

</script>

<template>
  <main class="profile-page">
    <div class="container py-5">
      <button
        class="btn btn-outline-secondary mb-3"
        type="button"
        @click="router.push('/home')"
      >
        To Home Page
      </button>

      <p v-if="loading" class="muted" role="status">Loading your profile...</p>
      <div v-else-if="loadError" class="alert alert-danger" role="alert">
        {{ loadError }}
      </div>

      <template v-else>
      <div class="page-heading mb-4">
        <div>
          <p class="eyebrow">YOUR KONGSI SPACE</p>
          <h1>My Profile</h1>
          <p class="subtitle">Share what you know. Discover what you can learn.</p>
        </div>
      </div>

      <!-- Profile header -->
      <section class="profile-hero mb-4">
        <div class="hero-top">
          <div class="avatar">{{ initials }}</div>

          <div class="profile-info">
            <p class="eyebrow">COMMUNITY MEMBER</p>
            <h2>{{ profile.name }}</h2>
            <p class="bio">{{ profile.bio || 'Add a bio to introduce yourself.' }}</p>
            <span class="location">
              📍 {{ profile.location || 'Location not added' }}
            </span>
          </div>

          <button
            class="edit-button"
            type="button"
            @click="startEditing"
          >
            ✎ Edit Profile
          </button>
        </div>

        <div class="interest-row">
          <span class="field-label">INTERESTS</span>
          <div class="tag-list">
            <span
              v-for="interest in profile.interests"
              :key="interest"
              class="interest-tag"
            >
              {{ interest }}
            </span>
            <span v-if="!profile.interests.length" class="muted">
              No interests added yet
            </span>
          </div>
        </div>
      </section>

      <!-- Credits -->
      <section class="credits-card mb-4">
        <div>
          <p class="eyebrow">YOUR SKILL EXCHANGE BALANCE</p>
          <h2>Skill Credits</h2>
          <p>Credits help you participate in skill-exchange sessions.</p>
        </div>
        <div class="credits-total">
          <strong>{{ profile.credits }}</strong>
          <span>AVAILABLE CREDITS</span>
        </div>
      </section>

      <!-- Skills -->
      <div class="row g-4 mb-5">
        <div class="col-12 col-lg-6">
          <section class="skills-panel h-100">
            <div class="panel-icon teach-icon">↗</div>
            <p class="eyebrow">SHARE YOUR KNOWLEDGE</p>
            <h2>Skills I Can Teach</h2>
            <p class="panel-description">
              The skills you can share with the Kongsi community.
            </p>

            <div class="tag-list">
              <RouterLink
                v-for="skill in profile.skillsTeach"
                :key="skill.title"
                class="skill-tag teach-tag"
                :to="skillEditPath('teach', skill.title)"
              >
                {{ skill.title }}
              </RouterLink>
              <p v-if="!profile.skillsTeach.length" class="muted">
                No teaching skills added yet.
              </p>
            </div>
            <RouterLink
              class="skill-action-button teach-action"
              to="/skills/teach/new"
            >
              Add a skill to teach
            </RouterLink>
          </section>
        </div>

        <div class="col-12 col-lg-6">
          <section class="skills-panel h-100">
            <div class="panel-icon learn-icon">✦</div>
            <p class="eyebrow">KEEP GROWING</p>
            <h2>Skills I Want to Learn</h2>
            <p class="panel-description">
              Explore new interests and find someone to learn from.
            </p>

            <div class="tag-list">
              <RouterLink
                v-for="skill in profile.skillsLearn"
                :key="skill.title"
                class="skill-tag learn-tag"
                :to="skillEditPath('learn', skill.title)"
              >
                {{ skill.title }}
              </RouterLink>
              <p v-if="!profile.skillsLearn.length" class="muted">
                No learning skills added yet.
              </p>
            </div>
            <RouterLink
              class="skill-action-button learn-action"
              to="/skills/learn/new"
            >
              Add a skill to learn
            </RouterLink>
          </section>
        </div>
      </div>

      <!-- Achievements -->
      <section class="achievements-section">
        <div class="section-heading">
          <div>
            <p class="eyebrow">YOUR LEARNING JOURNEY</p>
            <h2>My Skill Cards</h2>
            <p class="subtitle">A collection of achievements from your learning experiences.</p>
          </div>
          <span class="achievement-count">
            {{ skillCards.length }} achievements
          </span>
        </div>

        <div v-if="skillCards.length" class="row g-4">
          <div
            v-for="skill in skillCards"
            :key="skill.id"
            class="col-12 col-md-6 col-xl-4"
          >
            <SkillCard :skill="skill" />
          </div>
        </div>

        <div v-else class="empty-state">
          You haven't earned any Skill Cards yet.
        </div>
      </section>
      </template>
    </div>

    <!-- Edit Profile modal -->
    <div v-if="isEditing && !loading && !loadError" class="modal-overlay" @click.self="cancelEditing">
      <section
        class="edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-profile-title"
      >
        <div class="modal-heading">
          <div>
            <p class="eyebrow">PERSONALISE YOUR SPACE</p>
            <h2 id="edit-profile-title">Edit Profile</h2>
          </div>
          <button
            type="button"
            class="close-button"
            aria-label="Close"
            @click="cancelEditing"
          >
            ×
          </button>
        </div>

        <form @submit.prevent="saveChanges">
          <div class="form-field">
            <label for="profile-name">Display name</label>
            <input
              id="profile-name"
              v-model="draft.name"
              type="text"
              maxlength="60"
              required
            />
          </div>

          <div class="form-field">
            <label for="profile-bio">About me</label>
            <textarea
              id="profile-bio"
              v-model="draft.bio"
              rows="3"
              maxlength="300"
            ></textarea>
          </div>

          <div class="form-field">
            <label for="profile-location">Location</label>
            <input
              id="profile-location"
              v-model="draft.location"
              type="text"
              maxlength="100"
            />
          </div>

          <div class="form-field">
            <label for="profile-interests">Interests</label>
            <input
              id="profile-interests"
              v-model="draft.interests"
              type="text"
              placeholder="Sports, Photography, Technology"
            />
            <small>Separate each interest with a comma.</small>
          </div>

          <p v-if="formError" class="form-error" role="alert">
            {{ formError }}
          </p>

          <div class="modal-actions">
            <button type="button" class="cancel-button" @click="cancelEditing">
              Cancel
            </button>
            <button type="submit" class="save-button" :disabled="isSaving">
              {{ isSaving ? 'Saving...' : 'Save Profile' }}
            </button>
          </div>
        </form>
      </section>
    </div>
  </main>
</template>

<style scoped>
.profile-page {
  min-height: 100vh;
  background: #faf9f6;
  color: #44392b;
}

.page-heading,
.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 20px;
  flex-wrap: wrap;
}

.page-heading h1 {
  font-size: 34px;
  font-weight: 750;
  margin: 0 0 8px;
}

.eyebrow {
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 1.8px;
  color: #a48a65;
  margin-bottom: 9px;
}

.subtitle,
.muted {
  color: #897f71;
}

.subtitle {
  margin: 0;
  font-size: 14px;
}

.profile-hero {
  padding: 35px;
  background: #f3ecdc;
  border: 1px solid #e8ddc8;
  border-radius: 22px;
}

.hero-top {
  display: flex;
  align-items: flex-start;
  gap: 24px;
}

.avatar {
  width: 90px;
  height: 90px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #d6be94;
  color: #59452d;
  font-size: 29px;
  font-weight: 750;
  border: 4px solid #fff9ed;
}

.profile-info {
  flex: 1;
}

.profile-info h2 {
  font-size: 27px;
  font-weight: 750;
  margin: 0 0 10px;
}

.bio {
  color: #746652;
  margin-bottom: 12px;
  line-height: 1.7;
}

.location {
  font-size: 13px;
  color: #7a684f;
}

.edit-button,
.save-button {
  background: #5c4932;
  border: 1px solid #5c4932;
  color: white;
  border-radius: 10px;
  padding: 11px 17px;
  font-weight: 650;
  cursor: pointer;
}

.edit-button:hover,
.save-button:hover {
  background: #433321;
}

.interest-row {
  border-top: 1px solid #dfd1b9;
  margin-top: 30px;
  padding-top: 22px;
}

.field-label {
  display: block;
  color: #9c8463;
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 1.4px;
  margin-bottom: 12px;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
}

.interest-tag,
.skill-tag {
  display: inline-block;
  border-radius: 9px;
  padding: 9px 14px;
  font-size: 13px;
  font-weight: 600;
}

.interest-tag {
  background: #fffaf0;
  color: #756043;
  border: 1px solid #e8dcc5;
}

.skills-panel {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.skill-action-button {
  display: inline-block;
  margin-top: 20px;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 10px 15px;
  font-weight: 650;
  cursor: pointer;
  text-decoration: none;
}

.teach-action {
  background: #e8f1e8;
  border-color: #c8ddc8;
  color: #355d3d;
}

.learn-action {
  background: #e8eff5;
  border-color: #cbd9e5;
  color: #36546d;
}

.skill-action-button:hover {
  filter: brightness(0.96);
}

.credits-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  padding: 28px 34px;
  border-radius: 20px;
  background: #584630;
  color: white;
}

.credits-card .eyebrow {
  color: #d8bc8d;
}

.credits-card h2 {
  font-size: 23px;
  font-weight: 700;
}

.credits-card p:last-child {
  margin: 0;
  color: #e0d5c7;
  font-size: 13px;
}

.credits-total {
  text-align: center;
  min-width: 120px;
}

.credits-total strong {
  display: block;
  font-size: 48px;
  line-height: 1;
}

.credits-total span {
  display: block;
  margin-top: 9px;
  font-size: 10px;
  letter-spacing: 1px;
  color: #e0d1b9;
}

.skills-panel {
  padding: 30px;
  background: #fffefa;
  border: 1px solid #eae2d4;
  border-radius: 20px;
}

.panel-icon {
  width: 47px;
  height: 47px;
  display: grid;
  place-items: center;
  border-radius: 13px;
  font-size: 24px;
  margin-bottom: 20px;
}

.teach-icon {
  background: #e6eee1;
  color: #52724a;
}

.learn-icon {
  background: #f3e6d4;
  color: #9a713f;
}

.skills-panel h2 {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 10px;
}

.panel-description {
  color: #8b8071;
  font-size: 13px;
  margin-bottom: 24px;
}

.teach-tag {
  background: #edf3e9;
  color: #52724a;
  border: 1px solid #dce9d6;
}

.learn-tag {
  background: #f7eee0;
  color: #936b3d;
  border: 1px solid #eadcc7;
}

.section-heading {
  margin-bottom: 24px;
}

.section-heading h2 {
  font-size: 27px;
  font-weight: 750;
  margin-bottom: 8px;
}

.achievement-count {
  background: #f0e8d9;
  color: #82694b;
  padding: 9px 14px;
  border-radius: 30px;
  font-size: 12px;
  font-weight: 650;
}

.empty-state {
  padding: 40px;
  background: white;
  border: 1px dashed #ded1ba;
  border-radius: 16px;
  color: #897f71;
  text-align: center;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(35, 29, 21, 0.55);
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
}

.edit-modal {
  background: #fffefa;
  border-radius: 20px;
  padding: 30px;
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.2);
}

.modal-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 18px;
}

.modal-heading h2 {
  font-size: 26px;
  font-weight: 750;
}

.close-button {
  border: none;
  background: transparent;
  font-size: 30px;
  color: #786b5a;
  cursor: pointer;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-bottom: 16px;
}

.form-field label {
  font-size: 13px;
  font-weight: 650;
}

.form-field input,
.form-field textarea {
  width: 100%;
  border: 1px solid #ddd3c4;
  border-radius: 9px;
  padding: 11px 12px;
  background: white;
  color: #44392b;
}

.form-field input:focus,
.form-field textarea:focus {
  outline: 2px solid #d7b98a;
  outline-offset: 1px;
}

.form-field small {
  color: #938778;
  font-size: 11px;
}

.form-error {
  color: #a12626;
  font-size: 13px;
  font-weight: 600;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}

.cancel-button {
  border: 1px solid #d9cebd;
  border-radius: 10px;
  background: white;
  color: #62523e;
  padding: 11px 17px;
  font-weight: 650;
  cursor: pointer;
}

@media (max-width: 767px) {
  .hero-top {
    flex-direction: column;
  }

  .edit-button {
    width: 100%;
  }

  .profile-hero {
    padding: 24px;
  }

  .credits-card {
    align-items: flex-start;
    flex-direction: column;
  }

  .credits-total {
    text-align: left;
  }

  .page-heading h1 {
    font-size: 29px;
  }
}

@media (prefers-reduced-motion: reduce) {
  * {
    scroll-behavior: auto;
  }
}
</style>