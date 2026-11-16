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
  $1.99. **Stripe Checkout is live-capable:** when `STRIPE_SECRET_KEY`
  is set on the server, the Store creates a real Stripe Checkout Session
  (hosted by Stripe, no card details typed in the game) and the server
  verifies the paid session with Stripe before unlocking anything. With
  no key set, the Store keeps the old test flow (test card 4242 only, no
  real charge). "Free" here means **free hosting for Al** — the game is
  still monetized exactly as planned. Switching the store to live Stripe
  happens only after Al adds the live key from his existing LightWorks
  Stripe account — see "Going live with Stripe" below.
- Google sign-in stays off (no OAuth app yet).

## Going live with Stripe (real money)

Al already has a Stripe account for LightWorks — do NOT create a new one.
The game uses that account's **live secret key** (`sk_live_...`):

1. Al signs in to his Stripe Dashboard himself and copies the live secret
   key (Dashboard > Developers > API keys). He never sends the key in chat
   and it never goes in the repo.
2. In the Render dashboard, service `cfnb-cutthroat` > Environment, add
   `STRIPE_SECRET_KEY` with that value, then redeploy (Render restarts the
   service on env changes). No publishable key is needed — the browser
   never talks to Stripe; checkout is hosted by Stripe.
3. Verify live: sign in to the game, open the Store — it now says "Live
   payments" — buy the Family Pass with a real card and confirm it unlocks
   and the payment shows in Stripe. Test card 4242 no longer unlocks
   anything once live is on.

How it works: `POST /actions` `createCheckoutSession` creates a Stripe
Checkout Session (price_data, $4.99 / $1.99 USD, metadata `accountId` +
`product`) and returns Stripe's hosted URL; the player pays there and
Stripe redirects back to `/?checkout=success&session_id=...`. The app
then calls `confirmCheckout`, which retrieves the session from Stripe and
only unlocks when the session is paid, the product and amount match, and
the session belongs to that player's account. Each paid session is
recorded once (`stripe_payments`, unique session id), so a return/refresh
can't double-unlock.

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
