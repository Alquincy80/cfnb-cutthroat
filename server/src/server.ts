// Standalone Bun server for C.F.N.B. Cutthroat: Family Card Night.
// Serves the built React client from client/dist and implements
// POST /actions for the 14 game actions (same {action, args} shape the
// original Muse space used, returning {data} on success).
// Run: bun ./server/src/server.ts   (PORT env, default 3000)
// Build client first: bun run build

import { file } from "bun";
import { Actions } from "./actions";
import { db, migrate } from "./db";
import type { Ctx } from "./sdk";

const ctx: Ctx = {
  db: () => db,
  invalidateQueries: () => {},
};

const DIST = new URL("../../client/dist/", import.meta.url).pathname;

async function handleAction(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const action = (body as { action?: unknown })?.action;
  const args = (body as { args?: unknown })?.args ?? {};
  if (typeof action !== "string" || !(action in Actions)) {
    return Response.json({ error: `Unknown action: ${String(action)}` }, { status: 404 });
  }
  const def = Actions[action as keyof typeof Actions] as {
    request: { safeParse: (a: unknown) => { success: boolean; data?: unknown; error?: { message: string } } };
    response: { safeParse: (r: unknown) => { success: boolean; data?: unknown; error?: unknown } };
    handler: (ctx: Ctx, args: never) => Promise<unknown>;
  };
  const parsed = def.request.safeParse(args);
  if (!parsed.success) {
    return Response.json(
      { error: `Invalid arguments for ${action}: ${parsed.error?.message ?? "invalid arguments"}` },
      { status: 400 },
    );
  }
  try {
    const result = await def.handler(ctx, parsed.data as never);
    const checked = def.response.safeParse(result);
    if (!checked.success) {
      console.error(`Action ${action} returned invalid data`, checked.error);
      return Response.json({ error: "Internal error" }, { status: 500 });
    }
    return Response.json({ data: checked.data });
  } catch (err) {
    console.error(`Action ${action} failed`, err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/healthz") {
      return Response.json({ ok: true });
    }
    if (url.pathname === "/actions" && req.method === "POST") {
      return handleAction(req);
    }
    // Static client: client/dist/index.html + assets.
    let path = url.pathname === "/" ? "/index.html" : url.pathname;
    // Never let a path escape the dist dir.
    path = path.replace(/^\/+/, "");
    const f = file(DIST + path);
    if (await f.exists()) return new Response(f);
    // SPA fallback: unknown paths serve the app (it is a single-page app).
    return new Response(file(DIST + "index.html"));
  },
});

await migrate();
console.log(
  `C.F.N.B. Cutthroat listening on http://localhost:${server.port} (db: ${process.env.DATABASE_URL ? "Neon" : "local PGlite"})`,
);
