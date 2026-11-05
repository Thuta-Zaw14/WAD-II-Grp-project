<script setup>
import { computed } from 'vue'

const props = defineProps({
  skill: {
    type: Object,
    required: true
  }
})

const formattedDate = computed(() => {
  if (!props.skill.dateAttained) return 'Date unavailable'

  const [year, month, day] = props.skill.dateAttained.split('-').map(Number)
  const date = new Date(year, month - 1, day)

  if (
    !year || !month || !day ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return 'Date unavailable'
  }

  return date.toLocaleDateString('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
})

// the instructor's final grade from the Progress page (see services/progressRules.js)
const MASTERY = {
  practising: { icon: '🌿', label: 'Practising' },
  proficient: { icon: '🌳', label: 'Proficient' },
  mastered: { icon: '🏆', label: 'Mastered' },
}
const mastery = computed(() => MASTERY[props.skill.masteryLevel] || null)

const initials = computed(() => {
  return (props.skill.issuer || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(word => word.charAt(0).toUpperCase())
    .join('')
})
</script>

<template>
  <article class="achievement-card h-100">
    <div class="card-top">
      <div class="achievement-icon" aria-hidden="true">✦</div>

      <span class="achievement-type">
        {{ skill.category || 'Achievement' }}
      </span>
    </div>

    <div class="achievement-content">
      <div class="achievement-label">SKILL ACHIEVEMENT</div>

      <h3 class="achievement-title">
        {{ skill.name }}
      </h3>

      <span
        v-if="mastery"
        class="mastery-badge"
        :class="'mastery-' + skill.masteryLevel"
        :title="skill.masterySummary || ''"
        data-testid="mastery-badge"
      >
        {{ mastery.icon }} {{ mastery.label }}
      </span>

      <p class="achievement-description">
        Successfully completed this learning experience.
      </p>

      <div v-if="skill.courseTitle || skill.sessionDurationMinutes" class="course-details">
        <p v-if="skill.courseTitle" class="small mb-1">
          <strong>Course:</strong> {{ skill.courseTitle }}
        </p>
        <p v-if="skill.sessionDurationMinutes" class="small text-muted mb-0">
          One {{ skill.sessionDurationMinutes }}-minute lesson
        </p>
      </div>

      <div class="subskills-section">
        <p class="section-label">SKILLS LEARNED</p>

        <div v-if="skill.subskills?.length" class="subskills-list">
          <span
            v-for="subskill in skill.subskills"
            :key="subskill"
            class="subskill-tag"
          >
            {{ subskill }}
          </span>
        </div>

        <p v-else class="text-muted small mb-0">
          No subskills recorded.
        </p>
      </div>
    </div>

    <div class="achievement-footer">
      <div class="issuer-info">
        <div class="issuer-avatar" aria-hidden="true">
          {{ initials }}
        </div>

        <div>
          <span class="footer-label">ISSUED BY</span>
          <p class="footer-value">
            <!-- the instructor's name opens their profile (cards know them by teacherUid) -->
            <RouterLink v-if="skill.teacherUid" :to="'/members/' + skill.teacherUid" class="issuer-link">
              {{ skill.issuer || 'Instructor' }}
            </RouterLink>
            <template v-else>{{ skill.issuer || 'Unknown issuer' }}</template>
          </p>
        </div>
      </div>

      <div class="date-info">
        <span class="footer-label">DATE ATTAINED</span>
        <p class="footer-value">{{ formattedDate }}</p>
      </div>
    </div>
  </article>
</template>

<style scoped>
.mastery-badge {
  display: inline-block;
  margin-bottom: 10px;
  padding: 3px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.mastery-practising { background: #e6efe0; color: #3f6a35; }
.mastery-proficient { background: #d5e8d9; color: #2f5d3d; }
.mastery-mastered { background: #fbe7a8; color: #6b5200; }

.achievement-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fffdf8;
  border: 1px solid #e8dfce;
  border-radius: 20px;
  box-shadow: 0 4px 18px rgba(67, 52, 32, 0.04);
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}

.achievement-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 14px 32px rgba(67, 52, 32, 0.1);
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 24px 8px;
}

.achievement-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  background: #efe5cc;
  color: #886b3e;
  border-radius: 15px;
  font-size: 29px;
}

.achievement-type {
  background: #f3eee4;
  color: #806b4e;
  padding: 7px 12px;
  border-radius: 30px;
  font-size: 12px;
  font-weight: 600;
}

.achievement-content {
  flex: 1;
  padding: 18px 24px 24px;
}

.achievement-label,
.section-label,
.footer-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.4px;
  color: #9b8668;
}

.achievement-title {
  margin: 10px 0;
  font-size: 23px;
  font-weight: 700;
  color: #3f3427;
  line-height: 1.3;
}

.achievement-description {
  color: #827769;
  font-size: 13px;
  line-height: 1.7;
  margin-bottom: 25px;
}

.section-label {
  margin-bottom: 12px;
}

.subskills-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.subskill-tag {
  background: #f4f0e8;
  color: #6c5b43;
  border: 1px solid #eee5d6;
  border-radius: 8px;
  padding: 7px 11px;
  font-size: 12px;
  font-weight: 500;
}

.achievement-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 24px;
  border-top: 1px solid #eee7dc;
  background: #faf7f0;
}

.issuer-info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.issuer-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 50%;
  background: #d9c5a4;
  color: #55412c;
  font-size: 12px;
  font-weight: 700;
}

.footer-label {
  display: block;
  font-size: 9px;
  letter-spacing: 0.7px;
}

.footer-value {
  margin: 3px 0 0;
  color: #4e4030;
  font-size: 12px;
  font-weight: 600;
}

.issuer-link {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.issuer-link:hover,
.issuer-link:focus-visible {
  color: var(--k-brand);
}

.date-info {
  text-align: right;
}

@media (max-width: 400px) {
  .achievement-footer {
    align-items: flex-start;
    flex-direction: column;
  }

  .date-info {
    text-align: left;
  }
}

@media (prefers-reduced-motion: reduce) {
  .achievement-card {
    transition: none;
  }

  .achievement-card:hover {
    transform: none;
  }
}
</style>