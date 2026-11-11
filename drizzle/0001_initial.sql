-- 0001: accounts, progress, purchases, rooms, messages, reports
-- (Postgres version of the original SQLite migration; the original also
-- created then dropped a scratch "entries" table, which is omitted here.)
CREATE TABLE IF NOT EXISTS "accounts" (
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
);
CREATE TABLE IF NOT EXISTS "progress" (
  "id" serial PRIMARY KEY NOT NULL,
  "account_id" integer NOT NULL,
  "chapters" text DEFAULT '[]' NOT NULL,
  "total_wins" integer DEFAULT 0 NOT NULL,
  "games_played" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "progress_account_id_unique" UNIQUE("account_id")
);
CREATE TABLE IF NOT EXISTS "purchases" (
  "id" serial PRIMARY KEY NOT NULL,
  "account_id" integer NOT NULL,
  "product" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "rooms" (
  "id" serial PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "host_name" text NOT NULL,
  "seats" text DEFAULT '[]' NOT NULL,
  "player_count" integer DEFAULT 4 NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "rooms_code_unique" UNIQUE("code")
);
CREATE TABLE IF NOT EXISTS "messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "scope" text NOT NULL,
  "room_code" text,
  "author_name" text NOT NULL,
  "author_email" text,
  "body" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "reports" (
  "id" serial PRIMARY KEY NOT NULL,
  "reporter_name" text NOT NULL,
  "target_name" text NOT NULL,
  "reason" text NOT NULL,
  "scope" text DEFAULT 'lounge' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
