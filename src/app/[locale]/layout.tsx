import { NextIntlClientProvider, hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { TRPCReactProvider } from "@/trpc/client";
import { Header } from "@/components/layout/header";
import { Cormorant, Inter } from "next/font/google";
import "../globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter" });
const cormorant = Cormorant({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600"],
  variable: "--font-cormorant",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return (
    <html lang={locale}>
      <body className={`${inter.variable} ${cormorant.variable} font-sans antialiased`}>
        <NextIntlClientProvider>
          <TRPCReactProvider>
            <Header />
            {children}
          </TRPCReactProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
