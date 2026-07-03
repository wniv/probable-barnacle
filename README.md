# Ad QA

Upload Meta and TikTok video ads and get them automatically checked against QA rules using
Twelve Labs Pegasus 1.5. Currently checks for: **caption/on-screen text typos**.

## Local setup

The app needs a real Postgres database and Replit's Object Storage — Object Storage only works
when running inside a Replit workspace or deployment (its SDK talks to a local sidecar process
that doesn't exist elsewhere), so day-to-day local development against a plain `npm run dev` will
fail on the video-storage step specifically. Everything else (auth, admin console, Twelve Labs
calls) works with any Postgres instance.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in the values:

   ```bash
   cp .env.example .env
   ```

   ```
   DATABASE_URL="postgresql://user:pass@host:5432/db"
   TWELVE_LABS_API_KEY="your-key-here"  # from playground.twelvelabs.io
   AUTH_SECRET="..."                     # generate with: openssl rand -base64 32
   ```

   For local Postgres, the quickest option is a throwaway Docker container:

   ```bash
   docker run -d --name adqa-postgres -e POSTGRES_USER=adqa -e POSTGRES_PASSWORD=adqa \
     -e POSTGRES_DB=adqa -p 5433:5432 postgres:16-alpine
   # DATABASE_URL="postgresql://adqa:adqa@localhost:5433/adqa"
   ```

3. Apply the database schema:

   ```bash
   npx prisma migrate deploy
   ```

4. Create the first admin account (there's no public signup page):

   ```bash
   npm run create-admin -- you@example.com "a-strong-password" "Your Name"
   ```

5. Run the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) and sign in with the admin account above.
   Ad submission will fail at the storage step until this is actually running on Replit — see
   below.

## Deploying on Replit

1. **Get the code into Replit.** Push this repo to GitHub, then in Replit use "Import from GitHub"
   (`replit.com/import`). Two-way sync keeps the Repl and GitHub repo in sync afterward.

2. **Add the Database integration** (Replit's managed Postgres, in the left sidebar tools panel).
   This sets `DATABASE_URL` automatically in the workspace.

3. **Add the Object Storage integration** (same tools panel). No manual configuration needed —
   `@replit/object-storage` picks up the default bucket automatically.

4. **Set Secrets.** Add `TWELVE_LABS_API_KEY` and `AUTH_SECRET` in the workspace Secrets pane.

   **Important:** workspace Secrets only apply to the dev workspace. When you create the
   Deployment (next step), open its own **Secrets** section in the Deployments pane and add
   `TWELVE_LABS_API_KEY`, `AUTH_SECRET`, and `DATABASE_URL` there too — they don't carry over
   automatically.

5. **Create the deployment.** This repo's [`.replit`](.replit) file is pre-configured for
   **Autoscale** (`deploymentTarget = "cloudrun"`), which is correct here since the app has no
   local state left — Postgres holds the data and Object Storage holds the video files. Build
   command: `npm run build`. Run command applies pending Prisma migrations and starts the server:
   `npx prisma migrate deploy && npm run start`.

6. **Bootstrap the admin account.** After the first successful deploy, open the Replit **Shell**
   tab (against the workspace, which shares the same `DATABASE_URL` if you're using the Database
   integration) and run:

   ```bash
   npm run create-admin -- you@example.com "a-strong-password" "Your Name"
   ```

7. **Push updates.** Edit code (in Replit or via GitHub sync), then hit "Redeploy" in the
   Deployments pane. Autoscale rebuilds and replaces instances; expect a brief interruption per
   deploy since this isn't a zero-downtime rollout.

### Known limitation: no HTTP range support on video playback

`@replit/object-storage`'s SDK has no byte-range/partial-read API, so
[`/api/ads/[id]/video`](src/app/api/ads/[id]/video/route.ts) always returns the full file instead
of honoring `Range` requests the way the previous local-disk version did. For short ad creatives
this is a minor scrubbing/seek performance hit, not a functional break — the video still plays.
If this becomes a real problem, the fix is to serve a short-lived signed URL from Object Storage
directly instead of proxying bytes through Next.js (not implemented, since the SDK doesn't expose
signed URL generation either as of writing).

## Accounts & access control

- **Admin** accounts (created via `npm run create-admin`, or by another admin from the `/admin`
  screen) can see every agency's ads and can create new agencies and users. Admins don't submit
  ads themselves.
- **Agency** accounts belong to exactly one agency and only ever see that agency's ads. Create
  them from `/admin`: add the agency first, then add a user with role "Agency" assigned to it.
- There's no self-signup and no password-reset flow — an admin sets each user's initial password
  directly in the "Create user" form and shares it with them out of band. If someone needs a new
  password, an admin creates a fresh user entry (same email) or you extend the admin screen with
  a reset action.
- Every ad row and its uploaded video file is scoped to the agency that submitted it. Even the
  video file itself is served through an authenticated route (`/api/ads/[id]/video`), not a
  public static path, so another agency can't view it even with a direct link.

## How it works

1. You submit a video (Meta or TikTok ad) through the web UI, either by uploading a file or by
   pasting a direct/download link from Frame.io or Air (for agencies submitting assets — see
   below). It's stored in Replit Object Storage under a random key (`Ad.storageKey`).
2. The server uploads the video to Twelve Labs as an asset (`POST /assets`) and waits for it to
   finish processing.
3. It calls Pegasus 1.5 via `POST /analyze` with a prompt asking it to find spelling/grammar
   errors in on-screen text and captions, requesting structured JSON output.
4. Detected issues are stored in Postgres and shown on the ad's detail page with timestamps.

## Agency submissions via Frame.io / Air

The "Paste a link" tab on the upload form accepts a **direct file link**, not a share page URL —
the server does a plain HTTP fetch and expects a `video/*` response. In practice that means:

- **Air**: use "Copy direct link" on the asset (not the board share link).
- **Frame.io**: use the asset's download link (not the review/presentation link).

If the pasted link resolves to an HTML page instead of a video file, the app returns a clear
error asking for the direct link instead. This is a lightweight, no-API-key integration; it does
not auto-pull new agency uploads — someone still has to paste the link. Automating that would
require registering an OAuth app with Frame.io's V4 API and/or requesting Air API access from
their account team, plus a webhook receiver — a bigger lift than this app currently does.

## Adding more QA rules

Each check lives as its own prompt + parser in [`src/lib/twelvelabs.ts`](src/lib/twelvelabs.ts)
(see `analyzeCaptionTypos`) and issues are stored with a `type` field
(`Issue.type`, e.g. `"caption_typo"`) so more rule types can be added without changing the schema.
To add a new rule: write a new `analyze<Rule>` function with its own prompt/JSON schema, call it
alongside the existing check in `src/app/api/ads/route.ts`, and give the resulting issues a new
`type`.

## Tech stack

- Next.js (App Router) + TypeScript + Tailwind
- Prisma + Postgres (Replit's managed Database in production)
- Replit Object Storage for uploaded video files (`src/lib/storage.ts`)
- Auth.js (next-auth v5) with a Credentials provider, JWT sessions, bcrypt password hashing
- Twelve Labs Pegasus 1.5 (`/v1.3/assets` + `/v1.3/analyze`)
