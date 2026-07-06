import { expect, test } from "vitest";
import { slugifyBg } from "./slug";

test("транслитерира кирилица", () => {
  expect(slugifyBg("Фото Студио Пловдив")).toBe("foto-studio-plovdiv");
  expect(slugifyBg("Сватбена ЗАЛА «Щастие»")).toBe("svatbena-zala-shtastie");
  expect(slugifyBg("DJ Иво & Band 2026")).toBe("dj-ivo-band-2026");
});

test("реже дължина и празни резултати", () => {
  expect(slugifyBg("а".repeat(200)).length).toBeLessThanOrEqual(80);
  expect(slugifyBg("!!!")).toBe("");
});
