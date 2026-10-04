import { describe, expect, it } from "vitest";
import { parseLatestOfficialFuelPriceLink, parseOfficialFuelPrices } from "../src/modules/transport/fuelPrices.js";
import { calculateDeliveryCosts } from "../src/modules/transport/service.js";

describe("official Serbian fuel prices", () => {
  it("selects the first current fuel-price notice from the Ministry news feed", () => {
    const html = `<a href="/vest/22297/obavestenje-o-najvisoj-maloprodajnoj-ceni-derivata-nafte-evro-dizel-i-evro-premijum-bmb-95.php">current</a>
      <a href="/vest/22207/obavestenje-o-najvisoj-maloprodajnoj-ceni-derivata-nafte-evro-dizel-i-evro-premijum-bmb-95.php">old</a>`;
    expect(parseLatestOfficialFuelPriceLink(html)).toBe("https://must.gov.rs/vest/22297/obavestenje-o-najvisoj-maloprodajnoj-ceni-derivata-nafte-evro-dizel-i-evro-premijum-bmb-95.php");
  });

  it("extracts official petrol and diesel prices in RSD", () => {
    const html = `<main><p>EVRO DIZEL, у износу 236,00 динара за један литар</p>
      <p>EVRO PREMIJUM BMB 95 у износу 207,00 динара за један литар.</p></main>`;
    expect(parseOfficialFuelPrices(html)).toEqual({ petrolRSDPerL: 207, dieselRSDPerL: 236 });
  });

  it("fails instead of silently returning a stale or invented price", () => {
    expect(() => parseOfficialFuelPrices("<main>Цена није доступна</main>")).toThrow("not found");
  });
});

describe("delivery costs", () => {
  it("adds fuel and per-kilometre depreciation to total cost", () => {
    expect(calculateDeliveryCosts(100, 8, 1.75, 0.2)).toEqual({ fuelLitres: 8, fuelCostEUR: 14, depreciationCostEUR: 20, totalCostEUR: 34 });
  });
});
