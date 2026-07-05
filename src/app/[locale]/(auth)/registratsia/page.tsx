import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthForm } from "@/components/auth/auth-form";
import { Link } from "@/i18n/navigation";

export default async function SignUpPage() {
  const t = await getTranslations("Auth");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="font-serif text-3xl">{t("signUpTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <AuthForm mode="signUp" />
          <p className="text-sm text-muted-foreground">
            {t("haveAccount")}{" "}
            <Link className="text-primary underline" href="/vhod">
              {t("signInTitle")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
