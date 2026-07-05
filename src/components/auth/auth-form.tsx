"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  name: z.string().min(2).optional(),
  email: z.email(),
  password: z.string().min(8),
});
type FormValues = z.infer<typeof schema>;

export function AuthForm({ mode }: { mode: "signIn" | "signUp" }) {
  const t = useTranslations("Auth");
  const router = useRouter();
  const [error, setError] = useState(false);
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setError(false);
    const res =
      mode === "signUp"
        ? await authClient.signUp.email({
            email: values.email,
            password: values.password,
            name: values.name ?? "",
          })
        : await authClient.signIn.email({
            email: values.email,
            password: values.password,
          });
    if (res.error) setError(true);
    else router.push("/");
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      {mode === "signUp" && (
        <div className="space-y-2">
          <Label htmlFor="name">{t("name")}</Label>
          <Input id="name" {...form.register("name")} />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" type="email" {...form.register("email")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t("password")}</Label>
        <Input id="password" type="password" {...form.register("password")} />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{t("errorInvalid")}</p>}
      <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
        {mode === "signUp" ? t("signUpTitle") : t("signInTitle")}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => authClient.signIn.social({ provider: "google", callbackURL: "/" })}
      >
        {t("google")}
      </Button>
    </form>
  );
}
