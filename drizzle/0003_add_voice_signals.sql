-- 0003: voice_signals — WebRTC signaling relay for Family Room voice chat.
CREATE TABLE IF NOT EXISTS "voice_signals" (
  "id" serial PRIMARY KEY NOT NULL,
  "room_code" text NOT NULL,
  "from_client" text NOT NULL,
  "to_client" text NOT NULL,
  "kind" text NOT NULL,
  "payload" text DEFAULT '' NOT NULL,
  "created_at" bigint NOT NULL
);
