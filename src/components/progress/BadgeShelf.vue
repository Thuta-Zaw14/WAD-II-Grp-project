<script setup>
import { computed } from 'vue'

// The badges a student can earn on the Progress page (services/progressRules.js badgesFor).
// Earned ones are in colour; the rest are faded, with what to do to earn them.
const props = defineProps({
  badges: { type: Array, required: true }, // [{ id, icon, name, text, earned }]
})

const earnedCount = computed(() => props.badges.filter((b) => b.earned).length)
</script>

<template>
  <div>
    <p class="small text-muted mb-2">{{ earnedCount }} of {{ badges.length }} earned</p>
    <ul class="shelf list-unstyled mb-0" data-testid="badge-shelf">
      <li
        v-for="badge in badges"
        :key="badge.id"
        class="badge-tile"
        :class="{ earned: badge.earned }"
        :data-testid="'badge-' + badge.id"
        :title="badge.text"
      >
        <span class="icon" aria-hidden="true">{{ badge.icon }}</span>
        <span class="name">{{ badge.name }}</span>
        <span class="text">{{ badge.earned ? 'Earned' : badge.text }}</span>
        <span class="visually-hidden">{{ badge.earned ? '(earned)' : '(not earned yet)' }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.shelf {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}

.badge-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 2px;
  padding: 14px 10px;
  border-radius: 14px;
  border: 1px dashed var(--k-border);
  background: var(--k-surface);
  opacity: 0.6;
}

.badge-tile.earned {
  opacity: 1;
  border-style: solid;
  border-color: #e6c99a;
  background: linear-gradient(180deg, #fff8ea 0%, var(--k-surface) 100%);
  box-shadow: var(--k-shadow);
}

.icon {
  font-size: 28px;
  line-height: 1.2;
  filter: grayscale(1);
}

.earned .icon {
  filter: none;
}

.name {
  font-weight: 700;
  font-size: 14px;
}

.text {
  font-size: 12px;
  color: var(--k-muted);
}
</style>
