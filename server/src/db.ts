// Database connection for the standalone port.
//
// Production (Render + Neon): set DATABASE_URL to the Neon Postgres URL
// (pooled connection string, e.g. postgresql://...@...neon.tech/...?sslmode=require).
// The Neon serverless HTTP driver is used — no persistent connection, which
// suits Render's free tier.
//
// Local dev / verification (no DATABASE_URL): PGlite, a real Postgres
// running in-process, backed by ./data/pglite. Same SQL dialect, same
// migrations — no Neon account needed to test locally.

import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;

export const isNeon = Boolean(url);

mkdirSync("./data/pglite", { recursive: true });

export const db: ReturnType<typeof drizzleNeon> | ReturnType<typeof drizzlePglite> =
  url
    ? drizzleNeon(neon(url), { schema })
    : drizzlePglite(new PGlite("./data/pglite"), { schema });

// Run the Postgres migrations (drizzle/0001-0003) idempotently at boot.
// Render's free tier has an ephemeral filesystem, so the DB must be Neon;
// migrations are safe to re-run on every start.
export async function migrate(): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS "accounts" (
      "id" serial PRIMARY KEY NOT NULL,
      "email" text NOT NULL,
      "name" text NOT NULL,
      "pass_salt" text NOT NULL,
      "pass_hash" text NOT NULL,
      "birth_year" integer NOT NULL,
      "token" text NOT NULL,
      "strikes" integer DEFAULT 0 NOT NULL,
      "muted_until" bigint,
      "created_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "accounts_email_unique" UNIQUE("email")
    )`,
    `CREATE TABLE IF NOT EXISTS "progress" (
      "id" serial PRIMARY KEY NOT NULL,
      "account_id" integer NOT NULL,
      "chapters" text DEFAULT '[]' NOT NULL,
      "total_wins" integer DEFAULT 0 NOT NULL,
      "games_played" integer DEFAULT 0 NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "progress_account_id_unique" UNIQUE("account_id")
    )`,
    `CREATE TABLE IF NOT EXISTS "purchases" (
      "id" serial PRIMARY KEY NOT NULL,
      "account_id" integer NOT NULL,
      "product" text NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "rooms" (
      "id" serial PRIMARY KEY NOT NULL,
      "code" text NOT NULL,
      "host_name" text NOT NULL,
      "seats" text DEFAULT '[]' NOT NULL,
      "player_count" integer DEFAULT 4 NOT NULL,
      "status" text DEFAULT 'open' NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "rooms_code_unique" UNIQUE("code")
    )`,
    `CREATE TABLE IF NOT EXISTS "messages" (
      "id" serial PRIMARY KEY NOT NULL,
      "scope" text NOT NULL,
      "room_code" text,
      "author_name" text NOT NULL,
      "author_email" text,
      "body" text NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "reports" (
      "id" serial PRIMARY KEY NOT NULL,
      "reporter_name" text NOT NULL,
      "target_name" text NOT NULL,
      "reason" text NOT NULL,
      "scope" text DEFAULT 'lounge' NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "voice_signals" (
      "id" serial PRIMARY KEY NOT NULL,
      "room_code" text NOT NULL,
      "from_client" text NOT NULL,
      "to_client" text NOT NULL,
      "kind" text NOT NULL,
      "payload" text DEFAULT '' NOT NULL,
      "created_at" bigint NOT NULL
    )`,
  ];
  // Both drivers expose the same query surface through drizzle's session.
  // Use a raw SQL executor: neon-http via sql template, pglite via execute.
  for (const sql of statements) {
    await (db as unknown as { execute: (q: unknown) => Promise<unknown> }).execute(
      // drizzle's sql tag is imported lazily to keep this file driver-agnostic.
      (await import("drizzle-orm")).sql.raw(sql),
    );
  }
}
