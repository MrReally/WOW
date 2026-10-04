import type { Transport } from "@sever/contracts";

const MINISTRY_ORIGIN = "https://must.gov.rs";
const MINISTRY_NEWS_URL = `${MINISTRY_ORIGIN}/vesti/`;
const FUEL_NOTICE_SLUG = "obavestenje-o-najvisoj-maloprodajnoj-ceni-derivata-nafte-evro-dizel-i-evro-premijum-bmb-95.php";

function visibleText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseLatestOfficialFuelPriceLink(html: string) {
  const escapedSlug = FUEL_NOTICE_SLUG.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`href=["']([^"']+/${escapedSlug})["']`, "i"));
  if (!match?.[1]) throw new Error("Official fuel-price notice was not found");
  return new URL(match[1], MINISTRY_ORIGIN).toString();
}

function priceFollowing(text: string, label: RegExp) {
  const expression = new RegExp(`${label.source}[^0-9]{0,100}(\\d{2,3}(?:[.,]\\d{1,2})?)`, "gi");
  for (const match of text.matchAll(expression)) {
    const value = Number(match[1]!.replace(",", "."));
    if (value >= 50 && value <= 500) return value;
  }
  throw new Error(`Official ${label.source} price was not found`);
}

export function parseOfficialFuelPrices(html: string) {
  const text = visibleText(html);
  return {
    petrolRSDPerL: priceFollowing(text, /EVRO\s+PREMIJUM\s+BMB\s*95/),
    dieselRSDPerL: priceFollowing(text, /EVRO\s+DIZEL/),
  };
}

export interface OfficialFuelPrice {
  priceRSDPerL: number;
  sourceUrl: string;
}

export async function getOfficialSerbiaFuelPrice(fuelType: Transport.FuelType, fetcher: typeof fetch = fetch): Promise<OfficialFuelPrice> {
  if (fuelType === "electric") return { priceRSDPerL: 0, sourceUrl: MINISTRY_NEWS_URL };
  const request = async (url: string) => {
    const response = await fetcher(url, {
      headers: { Accept: "text/html", "User-Agent": "SEVER-App/1.0 fuel-price lookup" },
      signal: AbortSignal.timeout(7_000),
    });
    if (!response.ok) throw new Error(`Serbian Ministry returned ${response.status}`);
    return response.text();
  };
  const sourceUrl = parseLatestOfficialFuelPriceLink(await request(MINISTRY_NEWS_URL));
  const prices = parseOfficialFuelPrices(await request(sourceUrl));
  return {
    priceRSDPerL: fuelType === "diesel" ? prices.dieselRSDPerL : prices.petrolRSDPerL,
    sourceUrl,
  };
}
