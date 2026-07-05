import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthForm } from "@/components/auth/auth-form";
import { Link } from "@/i18n/navigation";

export default async function SignInPage() {
  const t = await getTranslations("Auth");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="font-serif text-3xl">{t("signInTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <AuthForm mode="signIn" />
          <p className="text-sm text-muted-foreground">
            {t("noAccount")}{" "}
            <Link className="text-primary underline" href="/registratsia">
              {t("signUpTitle")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
