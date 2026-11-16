// Real Stripe Checkout for C.F.N.B. Cutthroat — hosted Checkout Sessions.
//
// Live payments only happen when STRIPE_SECRET_KEY is set (Al adds the
// LIVE secret key himself in the Render dashboard, Environment — never in
// chat, never in git). The game never sees or stores card details: the
// player pays on Stripe's own hosted checkout page, Stripe redirects them
// back to the game, and the server verifies the session with Stripe before
// unlocking anything. A client claim alone never unlocks a product.
//
// With no key set, this module is inert and the Store keeps the existing
// 4242 test flow exactly as before.

import Stripe from "stripe";

export type ProductId = "family_pass" | "remove_ads";

export const PRODUCTS: Record<
  ProductId,
  { amountCents: number; name: string; description: string }
> = {
  family_pass: {
    amountCents: 499,
    name: "Full Family Pass — C.F.N.B. Cutthroat",
    description:
      "Story chapters 3–8, every felt and card back, and ads removed for good. One-time payment.",
  },
  remove_ads: {
    amountCents: 199,
    name: "Remove Ads — C.F.N.B. Cutthroat",
    description:
      "Removes the between-game ads for good. One-time payment.",
  },
};

/** True only when a live Stripe secret key is configured on the server. */
export function isLiveStripe(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  if (!stripeClient) {
    // No apiVersion passed: the SDK uses its own pinned version.
    // 20s timeout so a stalled Stripe call fails fast with a clean
    // error instead of hanging the player's checkout.
    stripeClient = new Stripe(key, { timeout: 20_000 });
  }
  return stripeClient;
}

const ALLOWED_ORIGINS = new Set([
  "https://cfnb-cutthroat.onrender.com",
  "http://localhost:3000",
  "http://localhost:5173",
]);

/** Only origins we serve the game from may be used as a Checkout return URL. */
export function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.has(origin);
}

export async function createCheckoutSession(args: {
  accountId: number;
  email: string;
  product: ProductId;
  origin: string;
}): Promise<string> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Live Stripe is not configured.");
  const product = PRODUCTS[args.product];
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: args.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: product.amountCents,
          product_data: {
            name: product.name,
            description: product.description,
          },
        },
      },
    ],
    metadata: {
      accountId: String(args.accountId),
      product: args.product,
      game: "cfnb-cutthroat",
    },
    success_url: `${args.origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}&product=${args.product}`,
    cancel_url: `${args.origin}/?checkout=cancelled`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
}

export interface VerifiedSession {
  product: ProductId;
  accountId: number;
  amountCents: number;
}

/**
 * Retrieve a Checkout Session from Stripe and verify it really was paid,
 * for the expected product and amount. Throws on any mismatch — callers
 * must only unlock after this returns.
 */
export async function verifyPaidSession(
  sessionId: string,
): Promise<VerifiedSession> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Live Stripe is not configured.");
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== "paid") {
    throw new Error("That Stripe payment has not completed yet.");
  }
  const product = session.metadata?.product as ProductId | undefined;
  const accountId = Number(session.metadata?.accountId ?? "");
  if (product !== "family_pass" && product !== "remove_ads") {
    throw new Error("That Stripe payment is not for a C.F.N.B. product.");
  }
  if (!Number.isInteger(accountId) || accountId <= 0) {
    throw new Error("That Stripe payment is not tied to a player account.");
  }
  if (session.currency?.toLowerCase() !== "usd") {
    throw new Error("That Stripe payment is not in USD.");
  }
  if (session.amount_total !== PRODUCTS[product].amountCents) {
    throw new Error("That Stripe payment amount does not match the product.");
  }
  return { product, accountId, amountCents: session.amount_total ?? 0 };
}
