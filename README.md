# C.F.N.B. Cutthroat: Family Card Night — standalone port

Standalone port of the Muse fullstack game, ready to run on its own site.
The live Muse artifact is untouched; this is a separate copy.

## What changed from the Muse version

- **No `@hatch/space-sdk`.** Server is a plain Bun server (`server/src/server.ts`)
  serving the built client and `POST /actions` for the 14 game actions.
  The client has its own tiny RPC client (`client/src/api.ts`) and its own
  `QueryClient` / `SafeAreaTopScrim`.
- **Postgres instead of SQLite.** Drizzle schema in `server/src/schema.ts`,
  Postgres migrations in `drizzle/0001-0003.sql` (run automatically at boot
  via `CREATE TABLE IF NOT EXISTS`). The original SQLite migrations are kept
  for reference in `drizzle-sqlite-reference/`.
- **Chat moderation is word-filter-only.** The original used an AI tone check
  (`ctx.inference`); this port has no model, so the banned-word list is the
  gate. Keep It Cool rules are unchanged: under-13 quick-talk only, reports
  feed strikes, 3 strikes = 24-hour cool-down, and `joinVoice` still turns
  away under-13 and cooled-down accounts.
- **Game, store, and prices are unchanged.** Quick Play, Story 1–2, and
  Family Rooms are free; Full Family Pass is $4.99 one-time and Remove Ads
  $1.99 in **Stripe test mode** (test card 4242 only, no real charge).
  "Free" here means **free hosting for Al** — the game is still monetized
  exactly as planned. Switching the store to live Stripe happens only after
  Al opens a Stripe account in his name and adds live keys.
- Google sign-in stays off (no OAuth app yet).

## Run locally (no accounts needed)

```bash
bun install
bun run build        # builds the client into client/dist
bun run start        # http://localhost:3000, PGlite DB in ./data/pglite
```

Without `DATABASE_URL` the server uses PGlite (real Postgres, in-process),
so the full game — accounts, rooms, chat, voice signalling — works locally
with no Neon account.

## Deploy free for testing (Render + Neon, $0, no card)

Al (or the person deploying) needs two free accounts, both with
alquincy80@gmail.com, no card for either:

1. **Neon** (neon.tech) — free project, 1 GB, no expiry. Create a project,
   copy the **pooled** connection string
   (`postgresql://...@...neon.tech/...?sslmode=require`).
   Do NOT use Render's free Postgres — it expires after 30 days.
2. **Render** (render.com) — free account. Create a **Web Service** from this
   repo/folder, plan **Free**, runtime Node, and use `render.yaml`
   (build: `npm install -g bun && bun install && bun run build`,
   start: `bun ./server/src/server.ts`). Set env var `DATABASE_URL` to the
   Neon pooled string in the Render dashboard. No card is asked for.
3. Open the service URL (`https://<name>.onrender.com`). First visit after
   15 min idle takes ~1 min while the free service wakes — normal.

Free-tier limits: Render free sleeps after 15 min idle (~1 min wake);
Neon free scales to zero after 5 min idle (short wake). Render itself says
don't use free instances for production — when the game starts earning,
the first paid step is ~$7/mo for an always-on Render service.

## Verify before sharing the link

- Open the site, sign up, sign in.
- Create a Family Room, note the 6-letter code, join it from a second
  browser/device with a different name.
- Post a chat message in the Lounge and in the room; post a banned word and
  confirm it is blocked with the "Keep it cool" notice.
- In the room, open voice (Join) from both sides and confirm both names
  show as speaking participants (real audio needs two devices with mics).
- Buy Family Pass with test card 4242 4242 4242 4242 and confirm it unlocks.
