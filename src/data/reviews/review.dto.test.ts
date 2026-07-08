import { expect, test } from "vitest";
import { ReviewCreateSchema, ReviewEditSchema, ReviewReplySchema } from "./review.dto";

const reviewId = "22222222-2222-4222-8222-222222222222";

function validCreateInput() {
  return {
    bookingId: "11111111-1111-4111-8111-111111111111",
    ratingQuality: 5, ratingCommunication: 4, ratingProfessionalism: 5, ratingValue: 4, ratingFlexibility: 5,
    title: "Страхотно преживяване",
    body: "Всичко мина безупречно, препоръчвам горещо на всички бъдещи младоженци.",
    wouldRecommend: true,
  };
}

test("ReviewCreateSchema: валиден вход минава", () => {
  expect(ReviewCreateSchema.safeParse(validCreateInput()).success).toBe(true);
});

test("ReviewCreateSchema: оценка извън 1..5 (или не-цяло число) се отхвърля", () => {
  for (const bad of [0, 6, 2.5, -1]) {
    expect(ReviewCreateSchema.safeParse({ ...validCreateInput(), ratingQuality: bad }).success).toBe(false);
  }
});

test("ReviewCreateSchema: title/body под минималната дължина се отхвърлят", () => {
  expect(ReviewCreateSchema.safeParse({ ...validCreateInput(), title: "Ъъ" }).success).toBe(false);
  expect(ReviewCreateSchema.safeParse({ ...validCreateInput(), body: "Кратко" }).success).toBe(false);
});

test("ReviewEditSchema: изисква id, няма bookingId поле", () => {
  const { bookingId, ...rest } = validCreateInput();
  expect(ReviewEditSchema.safeParse({ id: reviewId, ...rest }).success).toBe(true);
  expect(ReviewEditSchema.safeParse(rest).success).toBe(false); // липсва id
  expect(bookingId).toBeTruthy(); // само за да не остане неизползвана деструктурирана променлива
});

test("ReviewReplySchema: текст между 3 и 2000 символа", () => {
  expect(ReviewReplySchema.safeParse({ reviewId, text: "Ok" }).success).toBe(false); // <3
  expect(ReviewReplySchema.safeParse({ reviewId, text: "Благодарим!" }).success).toBe(true);
});
