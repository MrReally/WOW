import { describe, expect, it } from "vitest";
import { parseBenzinkoPrices } from "../src/modules/transport/benzinko.js";
import { calculateDeliveryCosts } from "../src/modules/transport/service.js";

describe("Benzinko fuel prices", () => {
  it("extracts median standard petrol and diesel prices and converts them to EUR", () => {
    const html = `<main>
      <div>BMB 95 <strong>202</strong></div><div>Evro Dizel <strong>231</strong></div>
      <div>BMB 95 <strong>200</strong></div><div>Evro Dizel <strong>229</strong></div>
      <div>BMB 95+ <strong>240</strong></div><div>Dizel Plus <strong>250</strong></div>
    </main>`;
    expect(parseBenzinkoPrices(html)).toEqual({ petrolEURPerL: 1.703, dieselEURPerL: 1.949 });
  });

  it("fails instead of silently returning a stale or invented price", () => {
    expect(() => parseBenzinkoPrices("<main>Učitavanje cena</main>")).toThrow("not found");
  });
});

describe("delivery costs", () => {
  it("adds fuel and per-kilometre depreciation to total cost", () => {
    expect(calculateDeliveryCosts(100, 8, 1.75, 0.2)).toEqual({
      fuelLitres: 8,
      fuelCostEUR: 14,
      depreciationCostEUR: 20,
      totalCostEUR: 34,
    });
  });
});
