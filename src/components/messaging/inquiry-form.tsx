"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function InquiryForm({ listingId }: { listingId: string }) {
  const t = useTranslations("Messages");
  const trpc = useTRPC();
  const { data: session } = authClient.useSession();
  const [body, setBody] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [phone, setPhone] = useState("");
  const [errorKey, setErrorKey] = useState<"errorSend" | "ownListing" | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);

  const createInquiry = useMutation(
    trpc.messaging.createInquiry.mutationOptions({
      onSuccess: (res) => setThreadId(res.threadId),
      // ownListing няма ownerId в публичния DTO → сървърът връща FORBIDDEN, разграничаваме тук
      onError: (err) => setErrorKey(err.data?.code === "FORBIDDEN" ? "ownListing" : "errorSend"),
    }),
  );

  if (!session) {
    return (
      <div className="rounded-lg border border-border p-4">
        <Button asChild>
          <Link href="/vhod">{t("loginToInquire")}</Link>
        </Button>
      </div>
    );
  }

  if (threadId) {
    return (
      <div className="rounded-lg border border-border p-4">
        <p className="font-medium">{t("successTitle")}</p>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <Link href={`/profil/saobshtenia/${threadId}`}>{t("viewConversation")}</Link>
        </Button>
      </div>
    );
  }

  const valid = body.trim().length >= 1;

  return (
    <form
      className="space-y-4 rounded-lg border border-border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErrorKey(null);
        if (!valid) return;
        createInquiry.mutate({
          listingId,
          body: body.trim(),
          eventDate: eventDate || undefined,
          phone: phone.trim() || undefined,
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="inquiry-body">{t("bodyLabel")}</Label>
        <Textarea
          id="inquiry-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("bodyPlaceholder")}
          maxLength={2000}
          rows={4}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="inquiry-date">{t("eventDateLabel")}</Label>
          <Input
            id="inquiry-date"
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="inquiry-phone">{t("phoneLabel")}</Label>
          <Input
            id="inquiry-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t("phonePlaceholder")}
            maxLength={30}
          />
        </div>
      </div>
      {errorKey && <p role="alert" className="text-sm text-destructive">{t(errorKey)}</p>}
      <Button type="submit" disabled={!valid || createInquiry.isPending}>
        {createInquiry.isPending ? t("sending") : t("send")}
      </Button>
    </form>
  );
}
