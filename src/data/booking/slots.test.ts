import { afterEach, expect, test, vi } from "vitest";
import { addMinutes, generateDaySlots, isPastDate, overlaps, todaySofia, weekdayOf } from "./slots";

afterEach(() => {
  vi.useRealTimers();
});

test("todaySofia/isPastDate: пресича UTC денонощна граница правилно (Sofia лято UTC+3)", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-10T22:30:00Z")); // Sofia локално: 2026-08-11 01:30
  expect(todaySofia()).toBe("2026-08-11");
  expect(isPastDate("2026-08-10")).toBe(true);
  expect(isPastDate("2026-08-11")).toBe(false);
  expect(isPastDate("2026-08-12")).toBe(false);
});

test("todaySofia: зима Sofia UTC+2 — граница на денонощието", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-15T22:30:00Z")); // Sofia локално: 2026-01-16 00:30
  expect(todaySofia()).toBe("2026-01-16");
  expect(isPastDate("2026-01-15")).toBe(true);
  expect(isPastDate("2026-01-16")).toBe(false);
});

test("weekdayOf: 0=понеделник…6=неделя", () => {
  expect(weekdayOf("2026-08-10")).toBe(0); // понеделник
  expect(weekdayOf("2026-08-11")).toBe(1); // вторник
  expect(weekdayOf("2026-08-16")).toBe(6); // неделя
});

test("weekdayOf: не се влияе от DST преход (март 2026)", () => {
  // DST в Sofia стартира 2026-03-29; денят от седмицата е инвариант спрямо tz
  expect(weekdayOf("2026-03-29")).toBe(6); // неделя
  expect(weekdayOf("2026-03-30")).toBe(0); // понеделник
});

test("overlaps: полу-отворени интервали", () => {
  expect(overlaps("10:00", "11:00", "11:00", "12:00")).toBe(false); // допират се
  expect(overlaps("10:00", "11:00", "10:59", "12:00")).toBe(true);
  expect(overlaps("10:00", "11:00", "09:00", "10:01")).toBe(true);
  expect(overlaps("10:00", "11:00", "09:00", "10:00")).toBe(false);
  expect(overlaps("10:00:00", "11:00:00", "10:30:00", "10:45:00")).toBe(true); // "HH:MM:SS" формат
});

test("overlaps: пълно съдържане в двете посоки", () => {
  expect(overlaps("10:00", "12:00", "10:30", "11:00")).toBe(true); // b в a
  expect(overlaps("10:30", "11:00", "10:00", "12:00")).toBe(true); // a в b
});

test("addMinutes", () => {
  expect(addMinutes("09:00", 90)).toBe("10:30");
  expect(addMinutes("23:30", 60)).toBe("00:30"); // прехвърля денонощието
});

test("generateDaySlots: back-to-back слотове в прозореца", () => {
  const slots = generateDaySlots({
    rules: [{ startTime: "09:00", endTime: "11:00" }],
    durationMinutes: 60, blocked: false, confirmedFullDay: false, confirmedHourly: [],
  });
  expect(slots).toEqual([
    { startTime: "09:00", endTime: "10:00" },
    { startTime: "10:00", endTime: "11:00" },
  ]);
});

test("generateDaySlots: последен непълен слот се отрязва", () => {
  const slots = generateDaySlots({
    rules: [{ startTime: "09:00", endTime: "10:30" }],
    durationMinutes: 60, blocked: false, confirmedFullDay: false, confirmedHourly: [],
  });
  expect(slots).toEqual([{ startTime: "09:00", endTime: "10:00" }]); // 10:00-11:00 не се събира
});

test("generateDaySlots: blocked ден → []", () => {
  const slots = generateDaySlots({
    rules: [{ startTime: "09:00", endTime: "18:00" }],
    durationMinutes: 60, blocked: true, confirmedFullDay: false, confirmedHourly: [],
  });
  expect(slots).toEqual([]);
});

test("generateDaySlots: confirmedFullDay → []", () => {
  const slots = generateDaySlots({
    rules: [{ startTime: "09:00", endTime: "18:00" }],
    durationMinutes: 60, blocked: false, confirmedFullDay: true, confirmedHourly: [],
  });
  expect(slots).toEqual([]);
});

test("generateDaySlots: припокриващ confirmedHourly маха точно засегнатия слот", () => {
  const slots = generateDaySlots({
    rules: [{ startTime: "09:00", endTime: "12:00" }],
    durationMinutes: 60, blocked: false, confirmedFullDay: false,
    confirmedHourly: [{ startTime: "10:00", endTime: "11:00" }],
  });
  expect(slots).toEqual([
    { startTime: "09:00", endTime: "10:00" },
    { startTime: "11:00", endTime: "12:00" },
  ]);
});

test("generateDaySlots: частично припокриващ confirmedHourly маха слота", () => {
  const slots = generateDaySlots({
    rules: [{ startTime: "09:00", endTime: "12:00" }],
    durationMinutes: 60, blocked: false, confirmedFullDay: false,
    confirmedHourly: [{ startTime: "10:30", endTime: "10:45" }], // частично в 10:00-11:00
  });
  expect(slots).toEqual([
    { startTime: "09:00", endTime: "10:00" },
    { startTime: "11:00", endTime: "12:00" },
  ]);
});

test("generateDaySlots: confirmedHourly допиращ границите на слот НЕ го маха", () => {
  // 10:00-11:00 резервация не бива да засяга съседните допиращи се слотове
  const slots = generateDaySlots({
    rules: [{ startTime: "09:00", endTime: "12:00" }],
    durationMinutes: 60, blocked: false, confirmedFullDay: false,
    confirmedHourly: [{ startTime: "10:00", endTime: "11:00" }],
  });
  // 09:00-10:00 (край допира 10:00) и 11:00-12:00 (начало допира 11:00) остават
  expect(slots).toEqual([
    { startTime: "09:00", endTime: "10:00" },
    { startTime: "11:00", endTime: "12:00" },
  ]);
});

test("generateDaySlots: множество availability прозорци в един ден", () => {
  const slots = generateDaySlots({
    rules: [
      { startTime: "09:00", endTime: "11:00" },
      { startTime: "14:00", endTime: "16:00" },
    ],
    durationMinutes: 60, blocked: false, confirmedFullDay: false, confirmedHourly: [],
  });
  expect(slots).toEqual([
    { startTime: "09:00", endTime: "10:00" },
    { startTime: "10:00", endTime: "11:00" },
    { startTime: "14:00", endTime: "15:00" },
    { startTime: "15:00", endTime: "16:00" },
  ]);
});

test("generateDaySlots: празен rules масив → []", () => {
  expect(generateDaySlots({
    rules: [], durationMinutes: 60, blocked: false, confirmedFullDay: false, confirmedHourly: [],
  })).toEqual([]);
});

test("generateDaySlots: durationMinutes по-голям от прозореца → []", () => {
  expect(generateDaySlots({
    rules: [{ startTime: "09:00", endTime: "09:30" }],
    durationMinutes: 60, blocked: false, confirmedFullDay: false, confirmedHourly: [],
  })).toEqual([]);
});

test("generateDaySlots: прозорец до полунощ, нищо не се събира → [] (НЕ виси)", () => {
  // старият код wrap-ваше края %24 и никога не терминираше за този вход
  const slots = generateDaySlots({
    rules: [{ startTime: "23:00", endTime: "23:59" }],
    durationMinutes: 90, blocked: false, confirmedFullDay: false, confirmedHourly: [],
  });
  expect(slots).toEqual([]);
});

test("generateDaySlots: слот, който би прехвърлил полунощ, се изключва", () => {
  const slots = generateDaySlots({
    rules: [{ startTime: "22:00", endTime: "23:59" }],
    durationMinutes: 60, blocked: false, confirmedFullDay: false, confirmedHourly: [],
  });
  expect(slots).toEqual([{ startTime: "22:00", endTime: "23:00" }]);
});

test("generateDaySlots: неравномерно деление на прозореца — последен частичен слот отпада", () => {
  const slots = generateDaySlots({
    rules: [{ startTime: "09:00", endTime: "10:15" }],
    durationMinutes: 30, blocked: false, confirmedFullDay: false, confirmedHourly: [],
  });
  expect(slots).toEqual([
    { startTime: "09:00", endTime: "09:30" },
    { startTime: "09:30", endTime: "10:00" },
  ]);
});

test("generateDaySlots: rule времена във format \"HH:MM:SS\" → изходът е нормализиран до \"HH:MM\"", () => {
  const slots = generateDaySlots({
    rules: [{ startTime: "09:00:00", endTime: "11:00:00" }],
    durationMinutes: 60, blocked: false, confirmedFullDay: false, confirmedHourly: [],
  });
  expect(slots[0]?.startTime).toBe("09:00");
  expect(slots).toEqual([
    { startTime: "09:00", endTime: "10:00" },
    { startTime: "10:00", endTime: "11:00" },
  ]);
});
