import { expect, test, vi } from "vitest";
import { listingsHiddenEmail, newMessageEmail, sendEmail, subscriptionPastDueEmail } from "./email";

test("newMessageEmail: subject + html съдържат обява/тяло/получател/URL", () => {
  const { subject, html } = newMessageEmail({
    recipientName: "Иван",
    listingTitle: "Фото Студио",
    body: "Свободни ли сте на 5-ти?",
    threadUrl: "https://example.com/profil/saobshtenia/abc",
  });
  expect(subject).toContain("Фото Студио");
  expect(html).toContain("Иван");
  expect(html).toContain("Свободни ли сте на 5-ти?");
  expect(html).toContain("https://example.com/profil/saobshtenia/abc");
});

test("newMessageEmail: escape-ва HTML в потребителското тяло", () => {
  const { html } = newMessageEmail({
    recipientName: "A", listingTitle: "T", body: "<script>x</script>", threadUrl: "https://x.y/z",
  });
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;");
});

test("sendEmail без RESEND_API_KEY: console.warn + return, без хвърляне", async () => {
  const prev = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await expect(sendEmail({ to: "x@y.z", subject: "s", html: "<p>h</p>" })).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
  if (prev !== undefined) process.env.RESEND_API_KEY = prev;
});

test("subscriptionPastDueEmail: съдържа форматираната дата и линк към абонамента", () => {
  const { subject, html } = subscriptionPastDueEmail({ graceUntil: new Date("2026-08-06T00:00:00.000Z") });
  expect(subject).toContain("абонамент");
  expect(html).toContain("/profil/dostavchik/abonament");
  expect(html).toContain("2026");
});

test("listingsHiddenEmail: съдържа броя скрити обяви и линк към абонамента", () => {
  const { subject, html } = listingsHiddenEmail({ count: 3 });
  expect(subject.length).toBeGreaterThan(0);
  expect(html).toContain("3");
  expect(html).toContain("/profil/dostavchik/abonament");
});
