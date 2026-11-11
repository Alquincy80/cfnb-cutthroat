DROP TABLE entries;
--> statement-breakpoint
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  pass_salt TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  birth_year INTEGER NOT NULL,
  token TEXT NOT NULL,
  strikes INTEGER NOT NULL DEFAULT 0,
  muted_until INTEGER,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL UNIQUE,
  chapters TEXT NOT NULL DEFAULT '[]',
  total_wins INTEGER NOT NULL DEFAULT 0,
  games_played INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  product TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  host_name TEXT NOT NULL,
  seats TEXT NOT NULL DEFAULT '[]',
  player_count INTEGER NOT NULL DEFAULT 4,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL,
  room_code TEXT,
  author_name TEXT NOT NULL,
  author_email TEXT,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_name TEXT NOT NULL,
  target_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'lounge',
  created_at INTEGER NOT NULL
);
