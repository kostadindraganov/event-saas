import { expect, test } from "vitest";
import { buildVendorCalendar, type IcalEvent } from "./ical";

const STAMP = new Date("2026-02-01T09:30:00.000Z");
const hourly: IcalEvent = {
  uid: "b1@event-review", summary: "Зает — Иван (Фотосесия)", location: "Студио Х",
  description: "https://example.com/x", isFullDay: false,
  eventDate: "2026-07-15", startTime: "14:00", endTime: "16:30",
};
const fullDay: IcalEvent = {
  uid: "b2@event-review", summary: "Зает — Мария (Сватбен пакет)", location: "Зала Роза",
  description: "https://example.com/y", isFullDay: true,
  eventDate: "2026-08-20", startTime: null, endTime: null,
};

test("skeleton: VCALENDAR wrapper + VTIMEZONE + PRODID", () => {
  const ics = buildVendorCalendar([hourly], { dtstamp: STAMP });
  expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  expect(ics).toContain("VERSION:2.0");
  expect(ics).toContain("BEGIN:VTIMEZONE\r\nTZID:Europe/Sofia");
});

test("every line ends with CRLF (no bare LF)", () => {
  const ics = buildVendorCalendar([hourly, fullDay], { dtstamp: STAMP });
  // split on CRLF, rejoin — must be identical (no stray \n)
  const rejoined = ics.split("\r\n").join("\r\n");
  expect(rejoined).toBe(ics);
  expect(/[^\r]\n/.test(ics)).toBe(false);
});

test("hourly event → TZID Sofia DTSTART/DTEND", () => {
  const ics = buildVendorCalendar([hourly], { dtstamp: STAMP });
  expect(ics).toContain("DTSTART;TZID=Europe/Sofia:20260715T140000");
  expect(ics).toContain("DTEND;TZID=Europe/Sofia:20260715T163000");
  expect(ics).toContain("DTSTAMP:20260201T093000Z");
  expect(ics).toContain("UID:b1@event-review");
});

test("full-day event → VALUE=DATE with exclusive (+1) DTEND", () => {
  const ics = buildVendorCalendar([fullDay], { dtstamp: STAMP });
  expect(ics).toContain("DTSTART;VALUE=DATE:20260820");
  expect(ics).toContain("DTEND;VALUE=DATE:20260821"); // exclusive end = next day
});

test("TEXT escaping: comma, semicolon, backslash, newline", () => {
  const e: IcalEvent = { ...hourly, summary: "A,B;C\\D\nE" };
  const ics = buildVendorCalendar([e], { dtstamp: STAMP });
  expect(ics).toContain("SUMMARY:A\\,B\\;C\\\\D\\nE");
});

test("line folding: >75 octets folds with CRLF + space, no mid-char split", () => {
  // 60 Cyrillic chars = 120 octets → must fold; each physical line ≤75 octets
  const long = "я".repeat(60);
  const e: IcalEvent = { ...hourly, summary: long };
  const ics = buildVendorCalendar([e], { dtstamp: STAMP });
  const physical = ics.split("\r\n");
  for (const line of physical) {
    expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
  }
  // continuation lines start with a single space
  const idx = physical.findIndex((l) => l.startsWith("SUMMARY:"));
  expect(physical[idx + 1].startsWith(" ")).toBe(true);
  // unfolding (drop CRLF+space) recovers the original escaped value
  const unfolded = ics.replace(/\r\n /g, "");
  expect(unfolded).toContain(`SUMMARY:${long}`);
});

test("empty events → valid empty VCALENDAR (no VEVENT)", () => {
  const ics = buildVendorCalendar([], { dtstamp: STAMP });
  expect(ics).toContain("BEGIN:VCALENDAR");
  expect(ics).toContain("END:VCALENDAR");
  expect(ics).not.toContain("BEGIN:VEVENT");
});
