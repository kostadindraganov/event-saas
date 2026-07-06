import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { ChatWindow } from "@/components/messaging/chat-window";

// ponytail: inline UUID guard — uuidParam/UUID_RE in catalog-search-params.ts aren't exported,
// and this task's scope is only these two files. Promote to a shared export if a third caller appears.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ locale: string; threadId: string }>;
}) {
  const { locale, threadId } = await params;
  setRequestLocale(locale);
  if (!UUID_RE.test(threadId)) notFound();
  return <ChatWindow threadId={threadId} />;
}
