import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { canAdmin } from "./user.policy";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
};

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const u = session.user;
  return {
    id: u.id,
    email: u.email,
    name: u.name ?? "",
    isAdmin: (u as { isAdmin?: boolean }).isAdmin ?? false,
  };
});

export const requireUser = cache(async (): Promise<SessionUser> => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
});

export const requireAdmin = cache(async (): Promise<SessionUser> => {
  const user = await requireUser();
  if (!canAdmin(user)) throw new Error("FORBIDDEN");
  return user;
});
