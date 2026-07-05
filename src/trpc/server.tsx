import "server-only";
import { cache } from "react";
import { createTRPCOptionsProxy, type TRPCQueryOptions } from "@trpc/tanstack-react-query";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { appRouter } from "./routers/_app";
import { getCurrentUser } from "@/data/users/require-user";
import { makeQueryClient } from "./query-client";
import { createCallerFactory } from "./init";

export const getQueryClient = cache(makeQueryClient);

export const trpc = createTRPCOptionsProxy({
  ctx: async () => ({ user: await getCurrentUser() }),
  router: appRouter,
  queryClient: getQueryClient,
});

export const caller = createCallerFactory(appRouter)(async () => ({
  user: await getCurrentUser(),
}));

export function HydrateClient(props: { children: React.ReactNode }) {
  return (
    <HydrationBoundary state={dehydrate(getQueryClient())}>
      {props.children}
    </HydrationBoundary>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- documented tRPC prefetch pattern requires `any` here
export function prefetch<T extends ReturnType<TRPCQueryOptions<any>>>(qo: T) {
  void getQueryClient().prefetchQuery(qo);
}
