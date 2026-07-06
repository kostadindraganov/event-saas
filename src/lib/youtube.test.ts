import { expect, test } from "vitest";
import { parseYouTubeId } from "./youtube";

test("разпознава всички формати", () => {
  expect(parseYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  expect(parseYouTubeId("https://youtu.be/dQw4w9WgXcQ?t=10")).toBe("dQw4w9WgXcQ");
  expect(parseYouTubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  expect(parseYouTubeId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
});

test("отхвърля чужди/невалидни URL-и", () => {
  expect(parseYouTubeId("https://vimeo.com/12345")).toBeNull();
  expect(parseYouTubeId("не е url")).toBeNull();
  expect(parseYouTubeId("https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ")).toBeNull();
});
