import { expect, test } from "vitest";
import { REGIONS } from "../../../scripts/seed-data";
import { CITY_COORDS } from "./city-coords";

test("всеки seed-нат град има координати", () => {
  for (const r of REGIONS) {
    const [lat, lng] = CITY_COORDS[r.city.slug] ?? [];
    expect(CITY_COORDS[r.city.slug], `липсва координата за ${r.city.slug}`).toBeDefined();
    // България: lat ~41–44.3, lng ~22.3–28.7
    expect(lat).toBeGreaterThan(41);
    expect(lat).toBeLessThan(44.5);
    expect(lng).toBeGreaterThan(22);
    expect(lng).toBeLessThan(29);
  }
});
