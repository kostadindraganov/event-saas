import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { polar, checkout, portal, webhooks } from "@polar-sh/better-auth";
import { Polar } from "@polar-sh/sdk";
import { db } from "@/db";
import { BillingDAL } from "@/data/billing/billing.dal";
import { PolarOrderPaidSchema, PolarSubscriptionEventSchema } from "@/data/billing/billing.dto";

// Polar е at-least-once; никога не хвърляй тук — webhook route-ът трябва да отговори 200,
// иначе Polar ще retry-ва безкрайно (upsert-ът е идемпотентен, дублирана доставка е ОК).
// Формата се проверява със Zod на seam-а: неочакван shape → log+skip, не тихо счупена проекция.
async function handleSubscriptionEvent(raw: unknown): Promise<void> {
  const parsed = PolarSubscriptionEventSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("Polar webhook: неочаквана форма на payload", parsed.error);
    return;
  }
  try {
    await BillingDAL.projectSubscriptionEvent(parsed.data);
  } catch (e) {
    console.error("Polar webhook проекция гръмна", e);
  }
}

// onOrderPaid е one-time покупка (промоция) — аналогичен wrapper, никога не хвърля (Polar at-least-once).
async function handleOrderPaidEvent(raw: unknown): Promise<void> {
  const parsed = PolarOrderPaidSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("Polar order webhook: неочаквана форма на payload", parsed.error);
    return;
  }
  try {
    await BillingDAL.projectOrderEvent(parsed.data);
  } catch (e) {
    console.error("Polar order webhook проекция гръмна", e);
  }
}

const hasGoogle = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

// ponytail: само POLAR_ACCESS_TOKEN гейтва плъгина (като hasGoogle) — ако 4-те
// POLAR_PRODUCT_* липсват, checkout() ще получи undefined productId; приемлив риск
// за local/dev без завършен Polar sandbox setup, ще гръмне ясно при реален checkout.
export const hasPolar = !!process.env.POLAR_ACCESS_TOKEN;

export const polarClient = hasPolar
  ? new Polar({
      accessToken: process.env.POLAR_ACCESS_TOKEN!,
      server: (process.env.POLAR_ENV as "sandbox" | "production" | undefined) ?? "sandbox",
    })
  : null;

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  rateLimit: { enabled: true },
  ...(hasGoogle
    ? {
        socialProviders: {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          },
        },
      }
    : {}),
  user: {
    additionalFields: {
      isAdmin: { type: "boolean", defaultValue: false, input: false },
      phone: { type: "string", required: false },
      deletedAt: { type: "date", required: false, input: false },
      anonymizedAt: { type: "date", required: false, input: false },
      icalToken: { type: "string", required: false, input: false },
    },
  },
  plugins: [
    ...(hasPolar && polarClient
      ? [
          polar({
            client: polarClient,
            // Отклонение от Tech Spec §2.2: lazy customer при checkout (externalCustomerId) — иначе Polar outage чупи регистрацията (E2E D1)
            createCustomerOnSignUp: false,
            use: [
              checkout({
                products: [
                  { productId: process.env.POLAR_PRODUCT_STANDARD_MONTHLY!, slug: "standard-monthly" },
                  { productId: process.env.POLAR_PRODUCT_STANDARD_YEARLY!, slug: "standard-yearly" },
                  { productId: process.env.POLAR_PRODUCT_PREMIUM_MONTHLY!, slug: "premium-monthly" },
                  { productId: process.env.POLAR_PRODUCT_PREMIUM_YEARLY!, slug: "premium-yearly" },
                  { productId: process.env.POLAR_PRODUCT_PROMOTION!, slug: "promotion" },
                ],
                successUrl: "/profil/dostavchik/abonament?checkout_id={CHECKOUT_ID}",
                authenticatedUsersOnly: true,
              }),
              portal(),
              // ponytail: webhooks() само при наличен secret — иначе webhooks({secret: undefined})
              // може да гръмне при startup (partial env: token да, secret не).
              ...(process.env.POLAR_WEBHOOK_SECRET
                ? [
                    webhooks({
                      secret: process.env.POLAR_WEBHOOK_SECRET,
                      onSubscriptionActive: (payload) => handleSubscriptionEvent(payload),
                      onSubscriptionUpdated: (payload) => handleSubscriptionEvent(payload),
                      onSubscriptionCanceled: (payload) => handleSubscriptionEvent(payload),
                      onSubscriptionRevoked: (payload) => handleSubscriptionEvent(payload),
                      onOrderPaid: (payload) => handleOrderPaidEvent(payload),
                    }),
                  ]
                : []),
            ],
          }),
        ]
      : []),
    nextCookies(),
  ],
});
