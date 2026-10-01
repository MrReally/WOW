import type { Transport } from "@sever/contracts";

const BENZINKO_URL = "https://benzinko.com/";
const BENZINKO_RSD_PER_EUR = 118;

const round = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

function visibleText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pricesFollowing(text: string, label: RegExp) {
  const values: number[] = [];
  const expression = new RegExp(`${label.source}[^0-9]{0,40}(\\d{2,3}(?:[.,]\\d{1,2})?)`, "gi");
  for (const match of text.matchAll(expression)) {
    const value = Number(match[1]!.replace(",", "."));
    if (value >= 50 && value <= 500) values.push(value);
  }
  return values;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

export function parseBenzinkoPrices(html: string) {
  const text = visibleText(html);
  const petrol = pricesFollowing(text, /BMB\s*95(?!\s*\+)/);
  const diesel = pricesFollowing(text, /Evro\s*Dizel/);
  if (!petrol.length || !diesel.length) throw new Error("Benzinko fuel prices were not found");
  return {
    petrolEURPerL: round(median(petrol) / BENZINKO_RSD_PER_EUR, 3),
    dieselEURPerL: round(median(diesel) / BENZINKO_RSD_PER_EUR, 3),
  };
}

export async function getBenzinkoFuelPrice(fuelType: Transport.FuelType, fetcher: typeof fetch = fetch) {
  if (fuelType === "electric") return 0;
  const response = await fetcher(BENZINKO_URL, {
    headers: { Accept: "text/html", "User-Agent": "SEVER-App/1.0 fuel-price lookup" },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Benzinko returned ${response.status}`);
  const prices = parseBenzinkoPrices(await response.text());
  return fuelType === "diesel" ? prices.dieselEURPerL : prices.petrolEURPerL;
}
