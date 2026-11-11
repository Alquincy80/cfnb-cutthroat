// Actions for C.F.N.B. Cutthroat: Family Card Night.
//
// Accounts (email/password, salted SHA-256), saved progress and unlocks,
// Stripe test-mode purchases, Family Rooms with 6-letter codes, and the
// "Keep It Cool" moderated chat.
//
// PORT NOTE: the original ran a model tone check through ctx.inference before
// any free-text message was stored. This standalone port has no model, so
// moderation is word-filter-only: the banned-word list below is the gate, and
// the strike / 24-hour cool-down rules are unchanged. Quick-talk phrases
// always pass; under-13 accounts still get quick-talk only.

import { defineAction, z, type ActionsModule, type Ctx } from "./sdk";
import { and, desc, eq, gt, lt } from "drizzle-orm";
import * as schema from "./schema";

const CURRENT_YEAR = 2026;

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(salt: string, password: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

function newToken(): string {
  return randomHex(24);
}

const BANNED_WORDS = [
  "damn", "hell", "shit", "fuck", "bitch", "asshole", "bastard", "dick",
  "pussy", "nigga", "nigger", "faggot", "retard", "whore", "slut", "crap",
  "piss", "douche", "stupid idiot", "shut up", "loser", "hate you", "kill",
  "die", "dumbass", "jackass", "suck", "stfu", "wtf",
];

function wordFilterHit(body: string): string | null {
  const lower = ` ${body.toLowerCase().replace(/[^a-z ]/g, " ")} `;
  for (const w of BANNED_WORDS) {
    if (lower.includes(` ${w} `) || lower.includes(w)) return w;
  }
  return null;
}

const QUICK_TALK = [
  "Good game!",
  "Nice play!",
  "You got me that time!",
  "Let's go again!",
  "Big Mama's house rules!",
  "Pass the cornbread!",
  "I bid 3!",
  "Watch out, I'm coming for 150!",
  "Good luck, family!",
  "That was a close one!",
];

const profileResponse = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  under13: z.boolean(),
  muted: z.boolean(),
  chapters: z.array(z.number()),
  totalWins: z.number(),
  gamesPlayed: z.number(),
  hasFamilyPass: z.boolean(),
  hasRemoveAds: z.boolean(),
});

type Profile = z.infer<typeof profileResponse>;

const emptyProfile = (error: string | null): Profile => ({
  ok: false,
  error,
  name: null,
  email: null,
  under13: false,
  muted: false,
  chapters: [],
  totalWins: 0,
  gamesPlayed: 0,
  hasFamilyPass: false,
  hasRemoveAds: false,
});

async function loadProfile(ctx: Ctx, token: string): Promise<Profile> {
  const db = ctx.db();
  const rows = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.token, token))
    .limit(1);
  const acct = rows[0];
  if (!acct) return emptyProfile("Session not found. Please sign in again.");
  const progRows = await db
    .select()
    .from(schema.progress)
    .where(eq(schema.progress.accountId, acct.id))
    .limit(1);
  const prog = progRows[0];
  const buys = await db
    .select()
    .from(schema.purchases)
    .where(eq(schema.purchases.accountId, acct.id));
  let chapters: number[] = [];
  try {
    const parsed: unknown = JSON.parse(prog?.chapters ?? "[]");
    if (Array.isArray(parsed)) {
      chapters = parsed.filter((n): n is number => typeof n === "number");
    }
  } catch {
    chapters = [];
  }
  return {
    ok: true,
    error: null,
    name: acct.name,
    email: acct.email,
    under13: CURRENT_YEAR - acct.birthYear < 13,
    muted: acct.mutedUntil != null && acct.mutedUntil > Date.now(),
    chapters,
    totalWins: prog?.totalWins ?? 0,
    gamesPlayed: prog?.gamesPlayed ?? 0,
    hasFamilyPass: buys.some((b) => b.product === "family_pass"),
    hasRemoveAds:
      buys.some((b) => b.product === "remove_ads") ||
      buys.some((b) => b.product === "family_pass"),
  };
}

async function accountByToken(ctx: Ctx, token: string) {
  const db = ctx.db();
  const rows = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.token, token))
    .limit(1);
  return rows[0] ?? null;
}

export const Actions = {
  signUp: defineAction({
    description:
      "Creates a player account with email and password and returns a session token plus the starting profile.",
    request: z.object({
      name: z.string().min(1).max(40),
      email: z.string().email().max(120),
      password: z.string().min(6).max(100),
      birthYear: z.number().int().min(1926).max(2026),
    }),
    response: z.object({
      token: z.string().nullable(),
      profile: profileResponse,
    }),
    async handler(ctx, args) {
      const db = ctx.db();
      const email = args.email.trim().toLowerCase();
      const existing = await db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.email, email))
        .limit(1);
      if (existing[0]) {
        return {
          token: null,
          profile: emptyProfile(
            "That email already has an account. Try signing in.",
          ),
        };
      }
      const salt = randomHex(12);
      const token = newToken();
      await db.insert(schema.accounts).values({
        email,
        name: args.name.trim(),
        passSalt: salt,
        passHash: await hashPassword(salt, args.password),
        birthYear: args.birthYear,
        token,
      });
      const inserted = await db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.token, token))
        .limit(1);
      const acct = inserted[0];
      if (!acct) {
        return {
          token: null,
          profile: emptyProfile("Sign-up failed. Please try again."),
        };
      }
      await db.insert(schema.progress).values({ accountId: acct.id });
      ctx.invalidateQueries();
      return { token, profile: await loadProfile(ctx, token) };
    },
  }),

  signIn: defineAction({
    description:
      "Signs a player in with email and password and returns a fresh session token plus their saved profile.",
    request: z.object({
      email: z.string().email().max(120),
      password: z.string().min(1).max(100),
    }),
    response: z.object({
      token: z.string().nullable(),
      profile: profileResponse,
    }),
    async handler(ctx, args) {
      const db = ctx.db();
      const email = args.email.trim().toLowerCase();
      const rows = await db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.email, email))
        .limit(1);
      const acct = rows[0];
      if (
        !acct ||
        acct.passHash !== (await hashPassword(acct.passSalt, args.password))
      ) {
        return {
          token: null,
          profile: emptyProfile("Email or password doesn't match our records."),
        };
      }
      const token = newToken();
      await db
        .update(schema.accounts)
        .set({ token })
        .where(eq(schema.accounts.id, acct.id));
      ctx.invalidateQueries();
      return { token, profile: await loadProfile(ctx, token) };
    },
  }),

  getProfile: defineAction({
    description:
      "Loads the signed-in player's profile: story progress, wins, purchases, age band, and mute state.",
    request: z.object({ token: z.string().min(1) }),
    response: profileResponse,
    async handler(ctx, args) {
      return loadProfile(ctx, args.token);
    },
  }),

  recordGameResult: defineAction({
    description:
      "Saves a finished game to the player's account: games played, total wins, and a story chapter win when one is passed.",
    request: z.object({
      token: z.string().min(1),
      won: z.boolean(),
      chapter: z.number().int().min(1).max(8).nullable(),
    }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db();
      const acct = await accountByToken(ctx, args.token);
      if (!acct) return { ok: false };
      const rows = await db
        .select()
        .from(schema.progress)
        .where(eq(schema.progress.accountId, acct.id))
        .limit(1);
      const prog = rows[0];
      let chapters: number[] = [];
      try {
        const parsed: unknown = JSON.parse(prog?.chapters ?? "[]");
        if (Array.isArray(parsed)) {
          chapters = parsed.filter(
            (n): n is number => typeof n === "number",
          );
        }
      } catch {
        chapters = [];
      }
      if (args.won && args.chapter != null && !chapters.includes(args.chapter)) {
        chapters.push(args.chapter);
        chapters.sort((a, b) => a - b);
      }
      const values = {
        chapters: JSON.stringify(chapters),
        totalWins: (prog?.totalWins ?? 0) + (args.won ? 1 : 0),
        gamesPlayed: (prog?.gamesPlayed ?? 0) + 1,
        updatedAt: new Date(),
      };
      if (prog) {
        await db
          .update(schema.progress)
          .set(values)
          .where(eq(schema.progress.id, prog.id));
      } else {
        await db
          .insert(schema.progress)
          .values({ accountId: acct.id, ...values });
      }
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  buyProduct: defineAction({
    description:
      "Completes a store purchase in Stripe test mode (test card 4242 only, no real charge) and unlocks the product on the player's account.",
    request: z.object({
      token: z.string().min(1),
      product: z.enum(["family_pass", "remove_ads"]),
      cardNumber: z.string().min(12).max(23),
    }),
    response: z.object({ ok: z.boolean(), error: z.string().nullable() }),
    async handler(ctx, args) {
      const db = ctx.db();
      const acct = await accountByToken(ctx, args.token);
      if (!acct) {
        return { ok: false, error: "Please sign in before buying." };
      }
      const digits = args.cardNumber.replace(/\D/g, "");
      if (digits !== "4242424242424242") {
        return {
          ok: false,
          error:
            "Test mode only accepts the Stripe test card 4242 4242 4242 4242. No real card is charged.",
        };
      }
      const existing = await db
        .select()
        .from(schema.purchases)
        .where(eq(schema.purchases.accountId, acct.id));
      if (!existing.some((p) => p.product === args.product)) {
        await db
          .insert(schema.purchases)
          .values({ accountId: acct.id, product: args.product });
      }
      ctx.invalidateQueries();
      return { ok: true, error: null };
    },
  }),

  createRoom: defineAction({
    description:
      "Creates a private Family Room with a fresh 6-letter code and seats the host; empty seats are filled by computer players.",
    request: z.object({
      hostName: z.string().min(1).max(40),
      playerCount: z.union([z.literal(3), z.literal(4)]),
    }),
    response: z.object({
      code: z.string().nullable(),
      error: z.string().nullable(),
    }),
    async handler(ctx, args) {
      const db = ctx.db();
      const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ";
      for (let attempt = 0; attempt < 8; attempt++) {
        let code = "";
        for (let i = 0; i < 6; i++) {
          code += alphabet[Math.floor(Math.random() * alphabet.length)];
        }
        const clash = await db
          .select()
          .from(schema.rooms)
          .where(eq(schema.rooms.code, code))
          .limit(1);
        if (clash[0]) continue;
        await db.insert(schema.rooms).values({
          code,
          hostName: args.hostName.trim(),
          seats: JSON.stringify([
            { name: args.hostName.trim(), kind: "human" },
          ]),
          playerCount: args.playerCount,
          status: "open",
        });
        ctx.invalidateQueries();
        return { code, error: null };
      }
      return { code: null, error: "Could not make a room code. Try again." };
    },
  }),

  joinRoom: defineAction({
    description:
      "Joins a Family Room by its 6-letter code, adding the player to a seat if one is open.",
    request: z.object({
      code: z.string().min(6).max(6),
      name: z.string().min(1).max(40),
    }),
    response: z.object({
      ok: z.boolean(),
      error: z.string().nullable(),
      seats: z.array(
        z.object({ name: z.string(), kind: z.string() }),
      ),
      playerCount: z.number(),
      hostName: z.string().nullable(),
    }),
    async handler(ctx, args) {
      const db = ctx.db();
      const code = args.code.trim().toUpperCase();
      const rows = await db
        .select()
        .from(schema.rooms)
        .where(eq(schema.rooms.code, code))
        .limit(1);
      const room = rows[0];
      if (!room) {
        return {
          ok: false,
          error: "No room with that code. Check the code and try again.",
          seats: [],
          playerCount: 4,
          hostName: null,
        };
      }
      let seats: { name: string; kind: string }[] = [];
      try {
        const parsed: unknown = JSON.parse(room.seats);
        if (Array.isArray(parsed)) {
          seats = parsed.filter(
            (s): s is { name: string; kind: string } =>
              typeof s === "object" &&
              s !== null &&
              typeof (s as { name?: unknown }).name === "string",
          );
        }
      } catch {
        seats = [];
      }
      const name = args.name.trim();
      if (!seats.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
        if (seats.length >= room.playerCount) {
          return {
            ok: false,
            error: "That room is full.",
            seats,
            playerCount: room.playerCount,
            hostName: room.hostName,
          };
        }
        seats.push({ name, kind: "human" });
        await db
          .update(schema.rooms)
          .set({ seats: JSON.stringify(seats) })
          .where(eq(schema.rooms.id, room.id));
        ctx.invalidateQueries();
      }
      return {
        ok: true,
        error: null,
        seats,
        playerCount: room.playerCount,
        hostName: room.hostName,
      };
    },
  }),

  getRoom: defineAction({
    description:
      "Reads a Family Room's seats and status by code so the lobby stays current.",
    request: z.object({ code: z.string().min(6).max(6) }),
    response: z.object({
      found: z.boolean(),
      seats: z.array(z.object({ name: z.string(), kind: z.string() })),
      playerCount: z.number(),
      hostName: z.string().nullable(),
      status: z.string().nullable(),
    }),
    async handler(ctx, args) {
      const db = ctx.db();
      const rows = await db
        .select()
        .from(schema.rooms)
        .where(eq(schema.rooms.code, args.code.trim().toUpperCase()))
        .limit(1);
      const room = rows[0];
      if (!room) {
        return {
          found: false,
          seats: [],
          playerCount: 4,
          hostName: null,
          status: null,
        };
      }
      let seats: { name: string; kind: string }[] = [];
      try {
        const parsed: unknown = JSON.parse(room.seats);
        if (Array.isArray(parsed)) seats = parsed as typeof seats;
      } catch {
        seats = [];
      }
      return {
        found: true,
        seats,
        playerCount: room.playerCount,
        hostName: room.hostName,
        status: room.status,
      };
    },
  }),

  listMessages: defineAction({
    description:
      "Lists the latest moderated chat messages for the Family Lounge or one Family Room's table chat.",
    request: z.object({
      scope: z.enum(["lounge", "room"]),
      roomCode: z.string().max(6).nullable(),
    }),
    response: z.object({
      messages: z.array(
        z.object({
          id: z.number(),
          authorName: z.string(),
          body: z.string(),
          createdAt: z.string(),
        }),
      ),
    }),
    async handler(ctx, args) {
      const db = ctx.db();
      const all = await db
        .select()
        .from(schema.messages)
        .orderBy(desc(schema.messages.id))
        .limit(200);
      const filtered = all
        .filter(
          (m) =>
            m.scope === args.scope &&
            (args.scope === "lounge" ||
              m.roomCode === (args.roomCode ?? "").toUpperCase()),
        )
        .slice(0, 50)
        .reverse();
      return {
        messages: filtered.map((m) => ({
          id: m.id,
          authorName: m.authorName,
          body: m.body,
          createdAt: m.createdAt.toISOString(),
        })),
      };
    },
  }),

  postMessage: defineAction({
    description:
      "Moderates then posts a chat message: word filter, under-13 quick-talk only, and auto-mute enforcement.",
    request: z.object({
      token: z.string().nullable(),
      guestName: z.string().max(40).nullable(),
      scope: z.enum(["lounge", "room"]),
      roomCode: z.string().max(6).nullable(),
      body: z.string().min(1).max(300),
      quickTalk: z.boolean(),
    }),
    response: z.object({
      posted: z.boolean(),
      notice: z.string().nullable(),
    }),
    async handler(ctx, args) {
      const db = ctx.db();
      const body = args.body.trim();
      if (!body) return { posted: false, notice: "Type a message first." };

      let authorName = (args.guestName ?? "Guest").trim() || "Guest";
      let authorEmail: string | null = null;
      let acct: typeof schema.accounts.$inferSelect | null = null;
      if (args.token) {
        acct = await accountByToken(ctx, args.token);
        if (acct) {
          authorName = acct.name;
          authorEmail = acct.email;
          if (acct.mutedUntil != null && acct.mutedUntil > Date.now()) {
            return {
              posted: false,
              notice:
                "You're on a cool-down from chat right now. Keep it cool, and you'll be back soon.",
            };
          }
          const under13 = CURRENT_YEAR - acct.birthYear < 13;
          if (under13 && !args.quickTalk) {
            return {
              posted: false,
              notice:
                "Players under 13 use the quick-talk phrases — pick one below and it posts right away.",
            };
          }
        }
      }

      const isQuickTalk = QUICK_TALK.includes(body);
      if (!isQuickTalk) {
        const hit = wordFilterHit(body);
        if (hit) {
          if (acct) {
            const strikes = acct.strikes + 1;
            await db
              .update(schema.accounts)
              .set({
                strikes,
                mutedUntil:
                  strikes >= 3 ? Date.now() + 24 * 60 * 60 * 1000 : acct.mutedUntil,
              })
              .where(eq(schema.accounts.id, acct.id));
          }
          ctx.invalidateQueries();
          return {
            posted: false,
            notice:
              "Keep it cool — that one can't post at this family table. Try saying it the friendly way.",
          };
        }
      }

      await db.insert(schema.messages).values({
        scope: args.scope,
        roomCode:
          args.scope === "room"
            ? (args.roomCode ?? "").toUpperCase()
            : null,
        authorName,
        authorEmail,
        body,
      });
      ctx.invalidateQueries();
      return { posted: true, notice: null };
    },
  }),

  joinVoice: defineAction({
    description:
      "Checks Keep It Cool standing, then clears a player to join a Family Room's voice chat: under-13 accounts and accounts on a chat cool-down are turned away.",
    request: z.object({
      token: z.string().nullable(),
      guestName: z.string().max(40).nullable(),
      roomCode: z.string().min(6).max(6),
    }),
    response: z.object({
      ok: z.boolean(),
      error: z.string().nullable(),
      name: z.string().nullable(),
    }),
    async handler(ctx, args) {
      const db = ctx.db();
      const code = args.roomCode.trim().toUpperCase();
      const rooms = await db
        .select()
        .from(schema.rooms)
        .where(eq(schema.rooms.code, code))
        .limit(1);
      if (!rooms[0]) {
        return {
          ok: false,
          error: "That room isn't open anymore, so voice can't start.",
          name: null,
        };
      }
      let name = (args.guestName ?? "Guest").trim() || "Guest";
      if (args.token) {
        const acct = await accountByToken(ctx, args.token);
        if (acct) {
          name = acct.name;
          if (acct.mutedUntil != null && acct.mutedUntil > Date.now()) {
            return {
              ok: false,
              error:
                "You're on a Keep It Cool cool-down, so voice chat is off for now too. It lifts when the cool-down ends.",
              name: null,
            };
          }
          if (CURRENT_YEAR - acct.birthYear < 13) {
            return {
              ok: false,
              error:
                "Players under 13 chat with quick-talk phrases, so voice chat stays off for under-13 accounts — the table chat still works.",
              name: null,
            };
          }
        }
      }
      return { ok: true, error: null, name };
    },
  }),

  voicePost: defineAction({
    description:
      "Relays one WebRTC voice signaling message (presence heartbeat, call offer/answer, network candidate, or leave) to another voice client in the same room.",
    request: z.object({
      roomCode: z.string().min(6).max(6),
      fromClient: z.string().min(1).max(80),
      toClient: z.string().min(1).max(80),
      kind: z.enum(["presence", "offer", "answer", "ice", "leave"]),
      payload: z.string().max(20000),
    }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db();
      await db.insert(schema.voiceSignals).values({
        roomCode: args.roomCode.trim().toUpperCase(),
        fromClient: args.fromClient,
        toClient: args.toClient,
        kind: args.kind,
        payload: args.payload,
        createdAt: Date.now(),
      });
      // Signaling rows are kindling: anything over two minutes old is dead.
      await db
        .delete(schema.voiceSignals)
        .where(lt(schema.voiceSignals.createdAt, Date.now() - 120000));
      return { ok: true };
    },
  }),

  voicePoll: defineAction({
    description:
      "Returns the voice signaling messages waiting for one client in a room, plus who is on voice there right now (presence heartbeats from the last 15 seconds).",
    request: z.object({
      roomCode: z.string().min(6).max(6),
      clientId: z.string().min(1).max(80),
      sinceId: z.number().int().min(0),
    }),
    response: z.object({
      signals: z.array(
        z.object({
          id: z.number(),
          fromClient: z.string(),
          kind: z.string(),
          payload: z.string(),
        }),
      ),
      participants: z.array(
        z.object({ clientId: z.string(), name: z.string() }),
      ),
    }),
    async handler(ctx, args) {
      const db = ctx.db();
      const code = args.roomCode.trim().toUpperCase();
      const rows = await db
        .select()
        .from(schema.voiceSignals)
        .where(
          and(
            eq(schema.voiceSignals.roomCode, code),
            gt(schema.voiceSignals.id, args.sinceId),
          ),
        )
        .limit(200);
      const signals = rows
        .filter(
          (r) =>
            r.fromClient !== args.clientId &&
            (r.toClient === args.clientId || r.toClient === "*"),
        )
        .map((r) => ({
          id: r.id,
          fromClient: r.fromClient,
          kind: r.kind,
          payload: r.payload,
        }));
      const recent = await db
        .select()
        .from(schema.voiceSignals)
        .where(
          and(
            eq(schema.voiceSignals.roomCode, code),
            gt(schema.voiceSignals.createdAt, Date.now() - 15000),
          ),
        )
        .limit(300);
      const leftAt = new Map<string, number>();
      for (const r of recent) {
        if (r.kind === "leave") leftAt.set(r.fromClient, r.createdAt);
      }
      const seen = new Map<string, { name: string; at: number }>();
      for (const r of recent) {
        if (r.kind !== "presence") continue;
        let name = "Family player";
        try {
          const parsed: unknown = JSON.parse(r.payload);
          if (
            typeof parsed === "object" &&
            parsed !== null &&
            typeof (parsed as { name?: unknown }).name === "string"
          ) {
            name = (parsed as { name: string }).name;
          }
        } catch {
          /* keep the fallback name */
        }
        const prev = seen.get(r.fromClient);
        if (!prev || r.createdAt > prev.at) {
          seen.set(r.fromClient, { name, at: r.createdAt });
        }
      }
      const participants = [...seen.entries()]
        .filter(([cid, p]) => (leftAt.get(cid) ?? 0) < p.at)
        .map(([clientId, p]) => ({ clientId, name: p.name }));
      return { signals, participants };
    },
  }),

  reportPlayer: defineAction({
    description:
      "Files a report against a chat player; three reports add a strike to that player's account and repeat strikes auto-mute for 24 hours.",
    request: z.object({
      reporterName: z.string().min(1).max(40),
      targetName: z.string().min(1).max(40),
      reason: z.string().min(1).max(200),
      scope: z.string().max(20),
    }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db();
      await db.insert(schema.reports).values({
        reporterName: args.reporterName.trim(),
        targetName: args.targetName.trim(),
        reason: args.reason.trim(),
        scope: args.scope,
      });
      const all = await db
        .select()
        .from(schema.reports)
        .where(eq(schema.reports.targetName, args.targetName.trim()));
      if (all.length >= 3) {
        const targets = await db
          .select()
          .from(schema.accounts)
          .where(eq(schema.accounts.name, args.targetName.trim()))
          .limit(1);
        const target = targets[0];
        if (target) {
          await db
            .update(schema.accounts)
            .set({
              strikes: target.strikes + 1,
              mutedUntil: Date.now() + 24 * 60 * 60 * 1000,
            })
            .where(eq(schema.accounts.id, target.id));
        }
      }
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),
} satisfies ActionsModule;
