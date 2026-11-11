// Drizzle schema for C.F.N.B. Cutthroat: Family Card Night — Postgres port.
// Same tables/columns as the original SQLite schema, converted to Postgres:
//  - AUTOINCREMENT integer PK -> serial
//  - timestamp_ms integers -> timestamp columns (JS Dates), except muted_until
//    and voice_signals.created_at, which stay millisecond-epoch bigints because
//    the game code compares them directly against Date.now().
//  - SQLite enum text -> plain text (validated by zod in the actions).

import {
  bigint,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passSalt: text("pass_salt").notNull(),
  passHash: text("pass_hash").notNull(),
  birthYear: integer("birth_year").notNull(),
  token: text("token").notNull(),
  strikes: integer("strikes").notNull().default(0),
  mutedUntil: bigint("muted_until", { mode: "number" }),
  createdAt: timestamp("created_at")
    .notNull()
    .defaultNow()
    .$defaultFn(() => new Date()),
});

export const progress = pgTable("progress", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().unique(),
  chapters: text("chapters").notNull().default("[]"),
  totalWins: integer("total_wins").notNull().default(0),
  gamesPlayed: integer("games_played").notNull().default(0),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$defaultFn(() => new Date()),
});

export const purchases = pgTable("purchases", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  product: text("product").notNull(),
  createdAt: timestamp("created_at")
    .notNull()
    .defaultNow()
    .$defaultFn(() => new Date()),
});

export const rooms = pgTable("rooms", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  hostName: text("host_name").notNull(),
  seats: text("seats").notNull().default("[]"),
  playerCount: integer("player_count").notNull().default(4),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at")
    .notNull()
    .defaultNow()
    .$defaultFn(() => new Date()),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  scope: text("scope").notNull(),
  roomCode: text("room_code"),
  authorName: text("author_name").notNull(),
  authorEmail: text("author_email"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at")
    .notNull()
    .defaultNow()
    .$defaultFn(() => new Date()),
});

// WebRTC voice-chat signaling relay: short-lived rows (presence heartbeats,
// SDP offers/answers, ICE candidates, leaves) that voice clients in the same
// Family Room poll for. Audio itself flows peer-to-peer, never through here.
export const voiceSignals = pgTable("voice_signals", {
  id: serial("id").primaryKey(),
  roomCode: text("room_code").notNull(),
  fromClient: text("from_client").notNull(),
  toClient: text("to_client").notNull(),
  kind: text("kind").notNull(),
  payload: text("payload").notNull().default(""),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  reporterName: text("reporter_name").notNull(),
  targetName: text("target_name").notNull(),
  reason: text("reason").notNull(),
  scope: text("scope").notNull().default("lounge"),
  createdAt: timestamp("created_at")
    .notNull()
    .defaultNow()
    .$defaultFn(() => new Date()),
});
