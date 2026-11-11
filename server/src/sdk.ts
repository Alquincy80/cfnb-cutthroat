// Standalone replacement for the tiny slice of @hatch/space-sdk the game
// actually uses: defineAction + the Ctx shape (db accessor + a no-op
// invalidateQueries — the standalone server has no cross-client query
// invalidation bus; clients refetch on their own polling/intervals).
// The original also used ctx.inference for an AI tone check; that is gone —
// chat moderation is now word-filter-only (see actions.ts).

import type { z } from "zod";
import type { db } from "./db";

export { z } from "zod";

export type Db = typeof db;

export interface Ctx {
  db: () => Db;
  invalidateQueries: () => void;
}

export interface ActionDefinition<
  Req extends z.ZodType = z.ZodType,
  Res extends z.ZodType = z.ZodType,
> {
  description: string;
  request: Req;
  response: Res;
  handler: (ctx: Ctx, args: z.infer<Req>) => Promise<z.infer<Res>>;
}

export function defineAction<
  Req extends z.ZodType,
  Res extends z.ZodType,
>(def: ActionDefinition<Req, Res>): ActionDefinition<Req, Res> {
  return def;
}

export type ActionsModule = Record<string, ActionDefinition>;
