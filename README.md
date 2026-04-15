# Morgan v. NexaGen — AI Mediation Exercise

A multi-party AI mediation chatbot for law school classroom exercises. Two students join a shared session — one as Plaintiff's Counsel, one as Defense Counsel — and an AI mediator facilitates the negotiation in real time.

---

## How It Works

```
┌──────────────┐       ┌──────────────┐
│  Student A   │       │  Student B   │
│  (Plaintiff) │       │  (Defense)   │
└──────┬───────┘       └──────┬───────┘
       │                      │
       ▼                      ▼
┌─────────────────────────────────────┐
│        Next.js Frontend             │
│       (Hosted on Netlify)           │
└──────────────┬──────────────────────┘
               │
       ┌───────┴───────┐
       ▼               ▼
┌──────────┐   ┌──────────────┐
│ Firebase │   │ /api/mediate │
│ Realtime │   │ (serverless) │
│   DB     │   └──────┬───────┘
└──────────┘          │
                      ▼
              ┌──────────────┐
              │ Anthropic API│
              └──────────────┘
```

Three services work together:

- **Firebase Realtime Database** — stores room data (who joined, which roles are taken, all messages). Both students' browsers connect to Firebase simultaneously and see updates instantly — no page refresh needed.
- **Next.js API Route** (`/api/mediate`) — a small serverless function that sits between the browser and the Anthropic API. It holds your API key securely on the server so students never see it.
- **Anthropic Claude** — powers the AI mediator persona, receiving the conversation history and case materials with each call.

---

## Prerequisites

You'll need four accounts/tools. All have free tiers that are sufficient for classroom use.

| What | Where to get it | Cost |
|------|-----------------|------|
| Node.js 18+ | https://nodejs.org | Free |
| Anthropic API key | https://console.anthropic.com | Pay per use (~$8–22 per class of 15 pairs) |
| Firebase project | https://console.firebase.google.com | Free tier |
| Netlify account | https://netlify.com | Free tier |

---

## Step 1: Firebase Setup

Firebase provides the real-time database that lets both students see the same conversation. This is the most involved step, but it only takes about 5–10 minutes.

### 1a. Create a Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com).
2. Click **"Add project"** (or "Create a project").
3. Enter a project name — something like `mediation-exercise`.
4. It will ask about Google Analytics. You can **disable** this — it's not needed for this app. Click **Continue**.
5. Wait a moment for the project to be created, then click **Continue** to enter the project dashboard.

### 1b. Enable Realtime Database

1. In the left sidebar, click **Build** → **Realtime Database**.
2. Click **"Create Database"**.
3. Choose a database location. Pick whichever is closest to your students (e.g., `us-central1` for US-based schools). Click **Next**.
4. Select **"Start in test mode"**. This allows open read/write access for 30 days, which is fine for a classroom exercise. Click **Enable**.
5. You should now see an empty database with a URL at the top like:
   ```
   https://mediation-exercise-default-rtdb.firebaseio.com/
   ```
   **Copy this URL** — you'll need it in Step 2.

### 1c. Register a Web App

1. Go back to **Project Settings** by clicking the gear icon next to "Project Overview" in the top-left.
2. Scroll down to **"Your apps"** section.
3. Click the **web icon** (`</>`) to add a web app.
4. Enter a nickname (e.g., `mediation-web`). Do **not** check "Also set up Firebase Hosting" — Netlify handles hosting.
5. Click **"Register app"**.
6. You'll see a code block with your Firebase config. You need these four values:

   ```
   apiKey: "AIzaSy..."         → NEXT_PUBLIC_FIREBASE_API_KEY
   authDomain: "mediation-exercise.firebaseapp.com"  → NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
   projectId: "mediation-exercise"  → NEXT_PUBLIC_FIREBASE_PROJECT_ID
   ```

   The `databaseURL` comes from Step 1b above:
   ```
   databaseURL: "https://mediation-exercise-default-rtdb.firebaseio.com"  → NEXT_PUBLIC_FIREBASE_DATABASE_URL
   ```

7. Click **"Continue to console"**. You're done with Firebase.

### 1d. Security Rules (Optional but Recommended)

The default test-mode rules expire after 30 days. For a semester-long deployment, go to **Realtime Database → Rules** and replace the default with:

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

This keeps access open but scopes it to the `rooms` path only. For tighter security (e.g., if you keep the app running long-term), consider adding Firebase Authentication.

---

## Step 2: Configure Environment Variables

Environment variables are how you give the app your secret keys without putting them in the code. You'll need five values total: one from Anthropic and four from Firebase.

### 2a. Get Your Anthropic API Key

1. Go to [console.anthropic.com](https://console.anthropic.com).
2. Create an account or sign in.
3. Go to **API Keys** in the left sidebar.
4. Click **"Create Key"**, name it (e.g., `mediation-app`), and copy it immediately — you won't see it again.
5. Add billing info under **Plans & Billing**. You only pay for what you use. You can set a monthly spending cap under **Usage Limits** — $25–50 is more than enough for a class.

### 2b. Create Your Local Environment File

1. Unzip the project and open the folder in your terminal:
   ```bash
   cd mediation-app
   ```

2. Copy the example environment file:
   ```bash
   cp .env.example .env.local
   ```

3. Open `.env.local` in any text editor (VS Code, TextEdit, Notepad — anything works) and fill in your values:

   ```
   # Your Anthropic API key (from Step 2a)
   ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxx

   # The four Firebase values (from Step 1c)
   NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxx
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=mediation-exercise.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=mediation-exercise
   NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://mediation-exercise-default-rtdb.firebaseio.com
   ```

**Why the naming matters:**
- `ANTHROPIC_API_KEY` does **not** have `NEXT_PUBLIC_` prefix — this keeps it server-side only. Students cannot see this value even if they inspect the page.
- The Firebase variables **do** have `NEXT_PUBLIC_` prefix — this is required because the browser needs them to connect directly to Firebase. Firebase API keys are safe to expose publicly; Firebase security rules (not the key) control actual data access.

### 2c. Test Locally

```bash
# Install dependencies (one time)
npm install

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Open a second browser tab or an incognito window to simulate the second party. Walk through the full flow:
1. Create a room in Tab 1
2. Copy the code and join in Tab 2
3. Pick roles in each tab
4. Verify the mediator delivers its opening statement
5. Send a message from one side and confirm the other side sees it

If this works, you're ready to deploy.

---

## Step 3: Deploy to Netlify

### 3a. Push Your Code to GitHub

Netlify deploys from a Git repository. If you don't already have one:

1. Go to [github.com](https://github.com) and create a new repository (e.g., `mediation-app`). Select **Private** if you don't want the code publicly visible.
2. In your terminal inside the project folder:

   ```bash
   git init
   git add .
   git commit -m "Initial mediation app"
   git remote add origin https://github.com/YOUR-USERNAME/mediation-app.git
   git branch -M main
   git push -u origin main
   ```

   **Note:** The `.gitignore` file ensures `.env.local` (with your secrets) is never pushed to GitHub.

### 3b. Connect to Netlify

1. Go to [app.netlify.com](https://app.netlify.com) and sign up or log in. You can sign in with your GitHub account for easiest setup.
2. Click **"Add new site"** → **"Import an existing project"**.
3. Select **GitHub** as your Git provider.
4. If prompted, authorize Netlify to access your GitHub repositories.
5. Find and select your `mediation-app` repository from the list.

### 3c. Configure Build Settings

Netlify should auto-detect settings from the `netlify.toml` file. Verify these values on the deploy configuration screen:

| Setting | Value |
|---------|-------|
| Build command | `npm run build` |
| Publish directory | `.next` |

### 3d. Add Environment Variables

This is the critical step — without these, the app will build but won't work.

1. On the same deploy configuration page, click **"Add environment variables"** (or expand "Advanced build settings").
2. Add all five variables:

   | Key | Value |
   |-----|-------|
   | `ANTHROPIC_API_KEY` | Your Anthropic key (starts with `sk-ant-`) |
   | `NEXT_PUBLIC_FIREBASE_API_KEY` | Your Firebase API key |
   | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `your-project.firebaseapp.com` |
   | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Your Firebase project ID |
   | `NEXT_PUBLIC_FIREBASE_DATABASE_URL` | `https://your-project-default-rtdb.firebaseio.com` |

3. Click **"Deploy site"**.

### 3e. Wait for the Build

The first build takes 1–3 minutes. You can watch progress in the **Deploys** tab. When it finishes, Netlify assigns a URL like:

```
https://cheerful-moonbeam-abc123.netlify.app
```

Open it and run through the same test you did locally. If it works, share this URL with your students.

### 3f. Custom Domain (Optional)

To use a cleaner URL like `mediation.law.yourschool.edu`:

1. In Netlify, go to **Site configuration** → **Domain management** → **Add a domain**.
2. Enter your domain and follow the DNS instructions Netlify provides.
3. Netlify provisions HTTPS automatically — no extra configuration needed.

### 3g. Updating the App

Any push to your `main` branch on GitHub automatically triggers a new Netlify deploy. If you edit the case materials, tweak the mediator prompt, or fix anything:

```bash
# Make your changes, then:
git add .
git commit -m "Updated case materials"
git push
```

The live site updates in about 1–2 minutes.

---

## Classroom Use

Share the Netlify URL with students. The flow:

1. **Student A** opens the site and clicks **Create Room**. They receive a 5-letter code (e.g., `KW3NP`).
2. **Student A** shares the code with **Student B** — verbally, written on the board, or via message.
3. **Student B** opens the same URL, enters the code under **Join a Session**.
4. Each student selects their role — **Plaintiff's Counsel** or **Defense Counsel**. Each role can only be claimed once per room.
5. Once both students have joined, the AI mediator automatically delivers its opening statement, explains ground rules, and invites opening statements.
6. Students take turns presenting their positions. The mediator responds after each message.

Multiple pairs can run simultaneously — each room code creates an independent session.

### Suggested Exercise Structure

- **Before class:** Assign students to pairs and sides. Distribute the case materials for review.
- **During class (45–60 min):** Run the mediation. Students should aim to get through opening statements, issue exploration, and at least initial settlement proposals.
- **After class:** Students copy their chat transcripts and submit alongside a reflection analyzing where the mediator was effective, where it showed bias, and what the exercise reveals about AI in dispute resolution.

---

## Cost Estimates

| Component | Free Tier Limit | Typical Classroom Cost |
|-----------|----------------|----------------------|
| Netlify | 100GB bandwidth, 300 build min/mo | $0 |
| Firebase Realtime DB | 1GB stored, 10GB transfer/mo | $0 |
| Anthropic API | N/A (pay per token) | ~$8–22 per class session (15 pairs) |

Each mediator response uses roughly 2,000–4,000 input tokens (system prompt + conversation history) and 500–1,000 output tokens. A full 20-exchange session costs approximately $0.50–1.50 at current Claude Sonnet pricing. Monitor usage at [console.anthropic.com](https://console.anthropic.com) → **Usage**.

---

## Project Structure

```
mediation-app/
├── .env.example              # Template — copy to .env.local and fill in
├── .gitignore                # Keeps secrets and build files out of Git
├── netlify.toml              # Netlify build + plugin configuration
├── next.config.js            # Next.js configuration
├── package.json              # Dependencies and scripts
├── README.md                 # This file
└── src/
    ├── app/
    │   ├── layout.js          # Root HTML layout + font imports
    │   ├── page.js            # Main UI: lobby → role select → chat
    │   └── api/
    │       └── mediate/
    │           └── route.js   # Serverless function: Anthropic API proxy
    └── lib/
        └── firebase.js        # Firebase Realtime DB helper functions
```

**Key files:**

- **`route.js`** — Contains the system prompt, case materials, and mediator behavioral rules. Edit this to swap in a different case or adjust the mediator's instructions.
- **`page.js`** — The entire user interface: lobby, role selection, and chat.
- **`firebase.js`** — Thin wrapper around Firebase calls. You shouldn't need to modify this.

---

## Customization

### Using a Different Case

Edit `CASE_FACTS` and `SYSTEM_PROMPT` at the top of `src/app/api/mediate/route.js`. The case file is plain text — replace it with whatever facts, claims, and party information your new case involves. The mediator instructions in `SYSTEM_PROMPT` are mostly case-agnostic, so you can usually keep them as-is and just update `CASE_FACTS`.

### Changing the AI Model

In `route.js`, find the `model` field in the API call body:
- `claude-sonnet-4-20250514` — current default. Good balance of quality and cost.
- `claude-opus-4-20250514` — higher quality responses, roughly 5x the cost.

### Adding a Password Gate

To prevent unauthorized access, add a simple environment variable like `SITE_PASSWORD` and check it on the lobby screen before allowing room creation. This is lighter than full authentication.

---

## Troubleshooting

**"ANTHROPIC_API_KEY is not configured"**
The environment variable isn't reaching the serverless function. In Netlify: go to **Site configuration → Environment variables** and verify the key is present and spelled exactly `ANTHROPIC_API_KEY` (no `NEXT_PUBLIC_` prefix). After adding or changing env vars, trigger a redeploy: **Deploys → Trigger deploy → Deploy site**.

**Firebase "Permission denied"**
Your Realtime Database rules may have expired (test mode lasts 30 days) or are too restrictive. Go to **Firebase Console → Realtime Database → Rules** and update them per Section 1d above.

**Messages don't sync between the two students**
Verify `NEXT_PUBLIC_FIREBASE_DATABASE_URL` is correct and points to your **Realtime Database** (not Firestore — they're different Firebase products). The URL format must be `https://your-project-default-rtdb.firebaseio.com`. Check in Firebase Console → Realtime Database — the URL is at the top of the page.

**Room code "not found"**
Room codes use uppercase letters and digits only. Make sure students enter the code exactly as shown. If the Firebase database is empty, the room may have been reset.

**Build fails on Netlify**
Check the build log in Netlify's **Deploys** tab. Common issues: missing `netlify.toml`, or the `@netlify/plugin-nextjs` package not in `devDependencies`. Both should already be configured in this project.

**Mediator doesn't respond / long loading**
The Anthropic API can occasionally have brief delays. If responses consistently fail, check your API key is valid and has billing configured at [console.anthropic.com](https://console.anthropic.com). Also verify you haven't hit your spending limit.
# mediation-app
# mediation-app
# mediation-app
