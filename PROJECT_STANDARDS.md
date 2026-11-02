# Kongsi — Project Standards

This file is the rulebook for every change to this repository, whether it is
written by a teammate or by an AI assistant. Read it before you start; if a
change needs to break a rule here, update this file in the same commit and
say why.

---

## 1. Branch and merge rules (read this first)

**`last-resort` is the working branch. Do not merge or push to `main`.**

- Start every piece of work from the latest `last-resort`:
  ```bash
  git fetch origin
  git switch -c <your-branch> origin/last-resort
  ```
- When it is done, merge it back into `last-resort` and push:
  ```bash
  git switch last-resort
  git pull origin last-resort
  git merge <your-branch>
  git push origin last-resort
  ```
- Pull requests target `last-resort` as the base branch, never `main`.
- Never force-push `last-resort`. If a push is rejected, pull and merge first.
- `main` is only updated when the team agrees to promote `last-resort`.
  When that happens, update this section.

Branch names: `feature/<short-name>`, `fix/<short-name>`, `docs/<short-name>`.

Commit messages: one short line in the imperative mood that says what changed,
e.g. `Add reflection step to course progress`, `Fix booking seat count`.

---

## 2. Project outline

Kongsi is a skill-exchange web app: members teach skills they have and book
courses to learn skills they want, paying with credits.

### Stack

| Part | Tech |
| --- | --- |
| Frontend | Vue 3 (`<script setup>`), Vue Router, Pinia, Bootstrap 5, Vite |
| Maps / charts | Leaflet, Chart.js |
| Auth | Firebase Auth (client) → ID token sent as `Authorization: Bearer <token>` |
| Backend | Node + Express 5 (`server/`), ES modules |
| Database | Firestore via `firebase-admin` (server side only) |

### Running locally

```bash
npm install
npm run dev
```

```bash
cd server
npm install
npm run dev
```

The frontend runs on `http://localhost:5173`, the API on `http://localhost:3000/api`.
Copy `.env.example` to `.env` and fill in the Firebase values. The server needs
its own Firebase Admin credentials (see `server/config/firebaseAdmin.js`).

### Folder map

```
src/
  view/         one file per page (routed in router/index.js)
  components/   reusable pieces used by several pages
  stores/       Pinia stores (shared state + loading/error)
  services/     api.js (every HTTP call), plus small helpers
  router/       routes and the admin navigation guard
  firebase.js   client Firebase setup
server/
  index.js      mounts every router under /api/...
  routes/       one Express router per resource
  models/       Firestore logic and business rules
  middleware/   verifyToken (login + ban check), verifyAdmin
  config/       Firebase Admin, credit rules, skill lists
  scripts/      one-off maintenance scripts
```

### Main features

- Login / sign-up with invite links (`LoginPage`)
- Home: course search and map (`HomePage`, `SkillSearch`)
- Teach and learn listings (`TeachSkillPage`, `LearnSkillPage`, `SkillListPage`)
- Bookings, sessions and progress with reflections (`SessionsPage`, `SessionProgressPage`)
- Private chat per booking, public discussion per course (`ChatPage`, `DiscussionPage`)
- Profiles and skill cards (`ProfilePage`, `PublicProfilePage`)
- Insights (`Insightspage`)
- Admin: users, bans, message reports (`AdminPage`, `AdminUserProfilePage`)

---

## 3. Coding standards

### General

- Match the code around you: same naming, same comment style, same patterns.
- Keep code simple and readable. Plain loops and small named helpers are
  preferred over clever one-liners.
- Comments explain **why** or give an example of the data, in plain English
  (see `server/config/credits.js` and `src/services/api.js`).
- 2-space indentation, single quotes, no semicolons.
- No unused files, imports or `console.log` debugging left behind.

### Frontend (Vue)

- Use `<script setup>` and the Composition API (`ref`, `computed`, `watch`).
- Pages go in `src/view/`, reusable pieces in `src/components/` (PascalCase file names).
- **All HTTP calls go through `src/services/api.js`.** Components and stores
  never call `axios` directly. Each function there uses `authConfig()` for the token.
- Shared data lives in a Pinia store in `src/stores/` with the same shape as
  the existing ones: `state` refs, a `loading` and `error` ref, async actions
  with `try/catch`, and a `reset()` for logout.
- Show server errors to the user with `errorText(err)`, not raw error objects.
- Use the existing `LoadingText`, `EmptyState` and `ToastMessage` components
  instead of writing new loading / empty / toast UI.
- Style with Bootstrap classes first; put custom CSS in a `<style scoped>`
  block or `src/assets/theme.css` for app-wide styles.
- New routes are added to `src/router/index.js`. Admin-only pages use
  `meta: { requiresAdmin: true }`.

### Backend (Express)

- One router per resource in `server/routes/`, mounted in `server/index.js`
  under `/api/<resource>` (kebab-case, plural).
- Every route that needs a logged-in user uses `verifyToken`; admin routes
  also use `verifyAdmin`. The client-side guard is not security — the server is.
- Validate every field from `req.body` on the server and return a friendly
  message: `res.status(400).json({ error: 'Please enter a title.' })`.
- Firestore reads and writes go through helpers in `server/models/`
  (e.g. `dbQuery.js`), not scattered across routes.
- Use `models/publicView.js` to decide what is sent back; never send another
  user's private fields.
- Business rules (credits, prices, booking rules) are decided on the server
  only. If the frontend shows a preview of a rule, keep both copies in sync
  (e.g. `server/config/credits.js` ↔ `src/services/credits.js`).

### Security and secrets

- Never commit `.env`, service-account JSON files or any API key.
- Never trust ids, prices or roles sent by the browser; read them from the
  verified token and Firestore.

---

## 4. Before you merge

- [ ] Branched from and merging into `last-resort`
- [ ] `npm run build` passes for the frontend
- [ ] Server starts with `npm run dev` in `server/` with no errors
- [ ] You clicked through the pages you changed in the browser, including the
      error and empty states
- [ ] No secrets, debug logs or unrelated changes in the diff
- [ ] This file is updated if you changed a rule, folder or workflow

---

## 5. Future direction

Known gaps and next steps, roughly in priority order. Tick them off or move
them here as the plan changes.

1. **Stabilise `last-resort`** as the single source of truth, then promote it to `main`.
2. **Secrets hygiene:** add `.env` and `server/.env` to `.gitignore`.
3. **One package manager:** both `package-lock.json` and `pnpm-lock.yaml` exist.
   Agree on one and delete the other lock file.
4. **Testing:** there are no automated tests yet (`server` `test` script is a
   placeholder). Start with the server rules most likely to break:
   credits, bookings and input validation.
5. **Config for deployment:** the server's CORS origin is hard-coded to
   `http://localhost:5173`; move it to an environment variable.
6. **Pictures:** media upload is built but switched off
   (`picturesEnabled = false` in `src/config.js`). Decide whether to turn it on.
7. **Duplicated rules:** the credit price function exists on both client and
   server. Consider having the server return the price preview instead.
8. **Linting / formatting:** add ESLint + Prettier so the style rules above are
   checked automatically.
