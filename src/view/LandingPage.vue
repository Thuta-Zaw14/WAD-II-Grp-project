<script setup>
import { ref, onMounted } from 'vue'
import { auth } from '../firebase'
import LogoMark from '../components/LogoMark.vue'
import heroImg from '../assets/signup.jpg'
import aboutImg from '../assets/login.jpg'

// The first page a visitor sees. Anyone can open it; someone already logged in gets a
// "Go to my home" button instead of "Log in" / "Sign up".
const loggedIn = ref(false)

onMounted(async () => {
  await auth.authStateReady() // wait until Firebase has restored the login
  loggedIn.value = auth.currentUser !== null
})

// the steps in "How it works"
const steps = [
  { icon: '🎓', title: 'Teach what you know', text: 'Share a skill you are good at, from guitar to Python, and earn time credits for every course you finish.' },
  { icon: '🔍', title: 'Find something new', text: 'Browse courses near you on the map or join online classes, filtered by genre and region.' },
  { icon: '🤝', title: 'Spend your credits', text: 'Book a session with your credits. They are only paid out once you and your coach both mark it finished.' },
]

const values = [
  { title: 'Everyone has something to teach', text: 'Skills are worth sharing, whether they came from a classroom or a kitchen.' },
  { title: 'Time is the currency', text: 'An hour of your time is worth the same as anyone else\'s. No money changes hands.' },
  { title: 'Learning is better together', text: 'Meeting people in your neighbourhood turns lessons into friendships.' },
]

// Change these to the team's real details
const contact = {
  email: 'hello@kongsi.sg',
  phone: '+65 6123 4567',
  address: 'Singapore',
  hours: 'Mon to Fri, 9am to 6pm',
}

const year = new Date().getFullYear()
</script>

<template>
  <div class="landing">
    <!-- Top bar -->
    <header class="top-bar sticky-top">
      <div class="container d-flex align-items-center gap-3 py-2">
        <RouterLink to="/" class="d-flex align-items-center gap-2 text-decoration-none">
          <LogoMark />
          <span class="brand-name">Kongsi</span>
        </RouterLink>

        <nav class="d-none d-md-flex gap-1 ms-3" aria-label="Sections">
          <a href="#about" class="link">Who we are</a>
          <a href="#mission" class="link">Our mission</a>
          <a href="#how" class="link">How it works</a>
          <a href="#contact" class="link">Contact</a>
        </nav>

        <div class="ms-auto d-flex gap-2">
          <RouterLink v-if="loggedIn" to="/home" class="btn btn-brand btn-sm">Go to my home</RouterLink>
          <template v-else>
            <RouterLink to="/login" class="btn btn-outline-secondary btn-sm">Log in</RouterLink>
            <RouterLink to="/login?mode=signup" class="btn btn-brand btn-sm">Sign up</RouterLink>
          </template>
        </div>
      </div>
    </header>

    <!-- Hero -->
    <section class="hero">
      <div class="container py-5">
        <div class="row align-items-center g-4">
          <div class="col-lg-6">
            <p class="eyebrow mb-2">Skill exchange in Singapore</p>
            <h1 class="display-5 mb-3">Share what you know.<br />Learn what you don't.</h1>
            <p class="lead mb-4">
              Kongsi means "share". Teach a skill to your neighbours, earn time credits, and spend
              them learning something new. No money needed.
            </p>
            <div class="d-flex flex-wrap gap-2">
              <RouterLink v-if="loggedIn" to="/home" class="btn btn-brand btn-lg px-4">Go to my home</RouterLink>
              <template v-else>
                <RouterLink to="/login?mode=signup" class="btn btn-brand btn-lg px-4">Get started, it's free</RouterLink>
                <RouterLink to="/login" class="btn btn-outline-secondary btn-lg px-4">I have an account</RouterLink>
              </template>
            </div>
            <p class="small text-muted mt-3 mb-0">New members start with 2 free time credits.</p>
          </div>
          <div class="col-lg-6">
            <img :src="heroImg" alt="People learning a skill together" class="hero-img" />
          </div>
        </div>
      </div>
    </section>

    <!-- Who we are -->
    <section id="about" class="section">
      <div class="container">
        <div class="row align-items-center g-4">
          <div class="col-md-5 order-md-2">
            <img :src="aboutImg" alt="A Kongsi coach with a learner" class="side-img" />
          </div>
          <div class="col-md-7 order-md-1">
            <p class="eyebrow mb-2">Who we are</p>
            <h2 class="mb-3">A community of learners and teachers</h2>
            <p>
              Kongsi is a skill-sharing platform built by a small team of students in Singapore. We noticed
              that the people around us know how to do amazing things, but rarely get the chance to pass them on.
            </p>
            <p class="mb-0">
              So we built a place where anyone can offer a course, anyone can join one, and everyone pays in
              the same currency: time. Whether you want to pick up badminton, watercolour or web development,
              there is probably someone nearby who would love to show you how.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Mission -->
    <section id="mission" class="section section-alt">
      <div class="container">
        <div class="text-center mx-auto mb-4 narrow">
          <p class="eyebrow mb-2">Our mission</p>
          <h2 class="mb-3">Make learning accessible by valuing everyone's time equally</h2>
          <p class="text-muted mb-0">
            We believe knowledge should flow freely between neighbours, not be locked behind price tags.
          </p>
        </div>
        <div class="row g-3">
          <div v-for="v in values" :key="v.title" class="col-md-4">
            <div class="k-card h-100 p-4">
              <h3 class="h5 mb-2">{{ v.title }}</h3>
              <p class="text-muted mb-0">{{ v.text }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- How it works -->
    <section id="how" class="section">
      <div class="container">
        <div class="text-center mb-4">
          <p class="eyebrow mb-2">How it works</p>
          <h2 class="mb-0">Three steps to your first lesson</h2>
        </div>
        <div class="row g-3">
          <div v-for="(s, i) in steps" :key="s.title" class="col-md-4">
            <div class="k-card k-lift h-100 p-4">
              <div class="d-flex align-items-center gap-2 mb-2">
                <span class="step-number">{{ i + 1 }}</span>
                <span class="step-icon" aria-hidden="true">{{ s.icon }}</span>
              </div>
              <h3 class="h5 mb-2">{{ s.title }}</h3>
              <p class="text-muted mb-0">{{ s.text }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Contact -->
    <section id="contact" class="section section-alt">
      <div class="container">
        <div class="row g-4 align-items-center">
          <div class="col-lg-5">
            <p class="eyebrow mb-2">Contact us</p>
            <h2 class="mb-3">We'd love to hear from you</h2>
            <p class="text-muted mb-0">
              Questions, feedback, or an idea for a partnership? Drop us a message and we will get back to
              you within two working days.
            </p>
          </div>
          <div class="col-lg-7">
            <div class="k-card p-4">
              <dl class="contact-list mb-0">
                <dt>📧 Email</dt>
                <dd><a :href="'mailto:' + contact.email">{{ contact.email }}</a></dd>
                <dt>📞 Phone</dt>
                <dd><a :href="'tel:' + contact.phone.replaceAll(' ', '')">{{ contact.phone }}</a></dd>
                <dt>📍 Based in</dt>
                <dd>{{ contact.address }}</dd>
                <dt>🕘 Hours</dt>
                <dd>{{ contact.hours }}</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Call to action and footer -->
    <section v-if="!loggedIn" class="cta text-center">
      <div class="container py-5">
        <h2 class="mb-3">Ready to share a skill?</h2>
        <RouterLink to="/login?mode=signup" class="btn btn-light btn-lg px-4 fw-semibold">Create your free account</RouterLink>
      </div>
    </section>

    <footer class="footer">
      <div class="container d-flex flex-wrap align-items-center gap-2 py-3">
        <LogoMark />
        <span class="fw-semibold">Kongsi</span>
        <span class="text-muted small ms-md-2">&copy; {{ year }} Kongsi. Built for WAD II.</span>
        <a :href="'mailto:' + contact.email" class="small ms-auto">{{ contact.email }}</a>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.landing {
  background: var(--k-bg);
}

/* jumping to a section leaves room for the sticky bar */
.landing section[id] {
  scroll-margin-top: 64px;
}

.top-bar {
  background: var(--k-surface);
  border-bottom: 1px solid var(--k-border);
}

.brand-name {
  font-family: var(--k-font-heading);
  font-size: 22px;
  font-weight: 700;
  color: var(--k-accent);
}

.link {
  padding: 6px 12px;
  border-radius: 999px;
  color: var(--k-muted);
  font-weight: 500;
  text-decoration: none;
  white-space: nowrap;
}

.link:hover {
  color: var(--k-text);
  background: var(--k-surface-alt);
}

.hero {
  background: linear-gradient(180deg, var(--k-surface-alt), var(--k-bg));
  border-bottom: 1px solid var(--k-border);
}

.hero h1 {
  color: var(--k-accent);
  font-weight: 700;
}

.hero-img,
.side-img {
  width: 100%;
  object-fit: cover;
  border-radius: var(--k-radius);
  box-shadow: var(--k-shadow-lift);
}

.hero-img {
  aspect-ratio: 4 / 3;
}

.side-img {
  aspect-ratio: 1 / 1;
  max-height: 360px;
}

.section {
  padding: 4rem 0;
}

.section-alt {
  background: var(--k-surface-alt);
  border-top: 1px solid var(--k-border);
  border-bottom: 1px solid var(--k-border);
}

.section h2 {
  color: var(--k-accent);
}

.narrow {
  max-width: 640px;
}

.step-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--k-accent);
  color: var(--k-on-accent);
  font-weight: 700;
}

.step-icon {
  font-size: 24px;
}

.contact-list {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.75rem 1.5rem;
}

.contact-list dt {
  font-weight: 600;
  white-space: nowrap;
}

.contact-list dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.cta {
  background: var(--k-accent);
  color: var(--k-on-accent);
}

.cta h2 {
  color: var(--k-on-accent);
}

.footer {
  background: var(--k-surface);
  border-top: 1px solid var(--k-border);
}
</style>
