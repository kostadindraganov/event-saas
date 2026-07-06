import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { polar, checkout, portal, webhooks } from "@polar-sh/better-auth";
import { Polar } from "@polar-sh/sdk";
import { db } from "@/db";

const hasGoogle = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

// ponytail: само POLAR_ACCESS_TOKEN гейтва плъгина (като hasGoogle) — ако 4-те
// POLAR_PRODUCT_* липсват, checkout() ще получи undefined productId; приемлив риск
// за local/dev без завършен Polar sandbox setup, ще гръмне ясно при реален checkout.
const hasPolar = !!process.env.POLAR_ACCESS_TOKEN;

const polarClient = hasPolar
  ? new Polar({
      accessToken: process.env.POLAR_ACCESS_TOKEN!,
      server: (process.env.POLAR_ENV as "sandbox" | "production" | undefined) ?? "sandbox",
    })
  : null;

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true },
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
    },
  },
  plugins: [
    ...(hasPolar && polarClient
      ? [
          polar({
            client: polarClient,
            createCustomerOnSignUp: true,
            use: [
              checkout({
                products: [
                  { productId: process.env.POLAR_PRODUCT_STANDARD_MONTHLY!, slug: "standard-monthly" },
                  { productId: process.env.POLAR_PRODUCT_STANDARD_YEARLY!, slug: "standard-yearly" },
                  { productId: process.env.POLAR_PRODUCT_PREMIUM_MONTHLY!, slug: "premium-monthly" },
                  { productId: process.env.POLAR_PRODUCT_PREMIUM_YEARLY!, slug: "premium-yearly" },
                ],
                successUrl: "/profil/dostavchik/abonament?checkout_id={CHECKOUT_ID}",
                authenticatedUsersOnly: true,
              }),
              portal(),
              // Задача 5 добавя onSubscriptionActive/Updated/Canceled/Revoked тук.
              webhooks({
                secret: process.env.POLAR_WEBHOOK_SECRET!,
              }),
            ],
          }),
        ]
      : []),
    nextCookies(),
  ],
});
