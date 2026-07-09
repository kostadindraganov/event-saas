import { expect, test } from "vitest";
import { appRouter } from "./_app";
import { createCallerFactory } from "../init";

const createCaller = createCallerFactory(appRouter);

test("отхвърля грешно потвърждение", async () => {
  const caller = createCaller({ user: { id: "u1", isAdmin: false, email: "", name: "" } });
  await expect(caller.account.delete({ confirmation: "изтрий" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
});
