// Typed RPC client for the standalone port. Types come straight from
// `server/src/actions.ts` — no codegen. The proxy POSTs `{action, args}`
// to `./actions` and returns the typed response (`{data}` on success).
//
// `import type { Actions }` is type-only by design: the client bundle never
// pulls in any server runtime. With `verbatimModuleSyntax: true`, dropping
// `type` is a compile error.

import type { z } from "zod";
import type { Actions } from "../../server/src/actions";

export type ApiRequest<_C, K extends keyof typeof Actions> = z.infer<
  (typeof Actions)[K]["request"]
>;

export type ApiResponse<_C, K extends keyof typeof Actions> = z.infer<
  (typeof Actions)[K]["response"]
>;

type ActionClient = {
  [K in keyof typeof Actions]: (
    args: ApiRequest<typeof Actions, K>,
  ) => Promise<ApiResponse<typeof Actions, K>>;
};

function createActionClient(): ActionClient {
  return new Proxy({} as ActionClient, {
    get(_target, name) {
      if (typeof name !== "string") return undefined;
      if (name === "then" || name === "catch" || name === "finally") {
        return undefined;
      }
      return async (args: unknown) => {
        const response = await fetch("./actions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: name, args: args ?? {} }),
        });
        const body = (await response.json()) as {
          data?: unknown;
          error?: string;
        };
        if (!response.ok || body.error) {
          throw new Error(
            body.error ?? `action ${name} failed: ${response.status}`,
          );
        }
        return body.data;
      };
    },
  });
}

export const api = createActionClient();
