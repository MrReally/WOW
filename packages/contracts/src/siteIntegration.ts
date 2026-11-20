import type { Currency, ID, ISODateTime } from "./common.js";

/** The two site environments are part of the order identity, never a UI-only flag. */
export type SiteOrderEnvironment = "test" | "live";
/** All statuses accepted by site_integration.inbox. */
export const SITE_IMPORT_STATUSES = [
  "received",
  "processing",
  "needs_review",
  "imported",
  "failed",
  "retryable_failure",
] as const;
export type SiteImportStatus = (typeof SITE_IMPORT_STATUSES)[number];

/** Runtime guard for inbox status values read from an untyped boundary. */
export function isSiteImportStatus(value: unknown): value is SiteImportStatus {
  return typeof value === "string" && (SITE_IMPORT_STATUSES as readonly string[]).includes(value);
}
export type SiteReviewReason =
  | "unknown_product"
  | "ambiguous_product_mapping"
  | "invalid_local_datetime"
  | "ambiguous_local_datetime"
  | "invalid_quote"
  | "invalid_payload"
  | "duplicate_payload_conflict"
  | "manual_review_required";

export interface SiteOrderIdentity {
  source: string;
  environment: SiteOrderEnvironment;
  externalOrderId: string;
}

/** Preserved without interpretation so an importer can always be replayed. */
export interface SiteInboxDTO extends SiteOrderIdentity {
  id: ID;
  rawPayload: unknown;
  payloadDigest: string | null;
  status: SiteImportStatus;
  attempts: number;
  leaseToken: string | null;
  leaseExpiresAt: ISODateTime | null;
  retryAfter: ISODateTime | null;
  lastError: string | null;
  reviewReasons: SiteReviewReason[];
  importId: ID | null;
  projectId: ID | null;
  receivedAt: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface SiteOrderLineDTO {
  lineId: string;
  siteProductId: string;
  name: string;
  quantity: number;
  unitDailyPrice: number | null;
  currency: Currency;
  raw: unknown;
}

/** One commercial total for the site line; components must never copy it. */
export interface SiteQuoteSnapshotDTO {
  id: ID;
  inboxId: ID;
  currency: Currency;
  subtotal: number | null;
  discountType: "percent" | "fixed" | "none" | null;
  discountValue: number | null;
  quotedTotal: number | null;
  lines: SiteOrderLineDTO[];
  rawQuote: unknown;
  createdAt: ISODateTime;
}

/** A version says how one site catalog unit becomes accounting components. */
export interface SiteProductMappingVersionDTO {
  id: ID;
  mappingId: ID;
  version: number;
  accountingUnit: "catalog_unit" | "catalog_pair" | "component";
  siteUnit: "item";
  status: "draft" | "published" | "superseded";
  sourceDocument: unknown;
  createdAt: ISODateTime;
}

export interface SiteProductMappingComponentDTO {
  id: ID;
  mappingVersionId: ID;
  componentKey: string;
  targetKind: "own_model" | "contractor_catalog";
  /** Opaque model or contractor-catalog ID, depending on targetKind. */
  targetId: ID;
  /** Required only for contractor_catalog targets. */
  contractorId: ID | null;
  /** Number of target catalog entries for one site item. */
  qtyPerSiteUnit: number;
  countingUnit: "physical_unit" | "catalog_entry";
  representedPhysicalQtyPerCatalogUnit: number | null;
  catalogEntryRepresentsBundle: boolean;
  createdAt: ISODateTime;
}

export interface RequestedEquipmentDTO {
  id: ID;
  projectId: ID;
  sourceImportId: ID;
  sourceSiteLineId: string;
  sourceMappingComponentKey: string;
  targetKind: "own_model" | "contractor_catalog";
  targetId: ID;
  contractorId: ID | null;
  siteQuantity: number;
  qtyPerSiteUnit: number;
  requestedQuantity: number;
  reviewStatus: "pending_review" | "ready" | "converted" | "rejected";
  convertedReservationId: ID | null;
  /** Set only when a contractor-catalog request is converted in a later phase. */
  convertedContractorItemId: ID | null;
  createdAt: ISODateTime;
  convertedAt: ISODateTime | null;
}

/** The unnormalised, signed body sent by the SEVER site webhook. */
export interface SiteWebhookPayloadDTO {
  id: string;
  event: "order.created";
  createdAt: ISODateTime;
  source: "test" | "live";
  lang: "sr" | "ru" | "en";
  items: Array<{ id: string; name: { sr: string; ru: string; en: string }; qty: number; pricePerDay: number }>;
  rental: { start: string; end: string; pickupTime: string; returnTime: string; days: number; discountPercent: number };
  totals: { perDay: number; total: number; currency: "EUR" };
  delivery: { type: "delivery" | "pickup"; address: string };
  customer: { name: string; telegram: string; phone: string; instagram: string; other: string; preferred: Array<"call" | "whatsapp" | "viber" | "other"> };
  [additionalField: string]: unknown;
}

/**
 * Validates the original site payload without normalising it or rejecting
 * future site fields. HMAC verification and receiving HTTP requests are R2.
 */
export function parseSiteWebhookPayload(value: unknown): SiteWebhookPayloadDTO {
  const fail = (field: string): never => { throw new Error(`Invalid site webhook payload: ${field}`); };
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("body");
  const body = value as Record<string, unknown>;
  const text = (field: string): string => typeof body[field] === "string" && body[field].trim() ? body[field] : fail(field);
  const number = (field: string): number => typeof body[field] === "number" && Number.isFinite(body[field]) ? body[field] : fail(field);
  const source = text("source"); if (source !== "test" && source !== "live") fail("source");
  const safeSource = source as "test" | "live";
  const lang = text("lang"); if (lang !== "sr" && lang !== "ru" && lang !== "en") fail("lang");
  const safeLang = lang as "sr" | "ru" | "en";
  if (text("event") !== "order.created") fail("event");
  if (Number.isNaN(Date.parse(text("createdAt")))) fail("createdAt");
  if (!Array.isArray(body.items) || body.items.length === 0) fail("items");
  const items = (body.items as unknown[]).map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return fail(`items[${index}]`);
    const row = item as Record<string, unknown>; const name = row.name as Record<string, unknown>;
    if (!name || typeof name !== "object" || ["sr", "ru", "en"].some(key => typeof name[key] !== "string" || !name[key])) fail(`items[${index}].name`);
    if (typeof row.id !== "string" || !row.id || typeof row.qty !== "number" || !Number.isFinite(row.qty) || row.qty < 1 || typeof row.pricePerDay !== "number" || !Number.isFinite(row.pricePerDay)) fail(`items[${index}]`);
    return { id: row.id as string, name: { sr: name.sr as string, ru: name.ru as string, en: name.en as string }, qty: row.qty as number, pricePerDay: row.pricePerDay as number };
  });
  const object = (field: string): Record<string, unknown> => body[field] && typeof body[field] === "object" && !Array.isArray(body[field]) ? body[field] as Record<string, unknown> : fail(field);
  const rental = object("rental"), totals = object("totals"), delivery = object("delivery"), customer = object("customer");
  const rentalText = (field: string) => typeof rental[field] === "string" && rental[field] ? rental[field] as string : fail(`rental.${field}`);
  const rentalNumber = (field: string) => typeof rental[field] === "number" && Number.isFinite(rental[field]) ? rental[field] as number : fail(`rental.${field}`);
  const deliveryType = delivery.type; if (deliveryType !== "delivery" && deliveryType !== "pickup") fail("delivery.type");
  const safeDeliveryType = deliveryType as "delivery" | "pickup";
  if (totals.currency !== "EUR" || typeof totals.perDay !== "number" || !Number.isFinite(totals.perDay) || typeof totals.total !== "number" || !Number.isFinite(totals.total)) fail("totals");
  const contact = (field: string) => typeof customer[field] === "string" ? customer[field] as string : fail(`customer.${field}`);
  if (!Array.isArray(customer.preferred) || customer.preferred.some(item => !["call", "whatsapp", "viber", "other"].includes(item as string))) fail("customer.preferred");
  return { id: text("id"), event: "order.created", createdAt: text("createdAt"), source: safeSource, lang: safeLang, items,
    rental: { start: rentalText("start"), end: rentalText("end"), pickupTime: rentalText("pickupTime"), returnTime: rentalText("returnTime"), days: rentalNumber("days"), discountPercent: rentalNumber("discountPercent") },
    totals: { perDay: totals.perDay as number, total: totals.total as number, currency: "EUR" },
    delivery: { type: safeDeliveryType, address: typeof delivery.address === "string" ? delivery.address : fail("delivery.address") },
    customer: { name: contact("name"), telegram: contact("telegram"), phone: contact("phone"), instagram: contact("instagram"), other: contact("other"), preferred: customer.preferred as Array<"call" | "whatsapp" | "viber" | "other"> },
    ...body,
  };
}

export interface ClientContactIdentityDTO {
  id: ID;
  clientId: ID;
  identityType: "phone" | "email" | "instagram" | "site_customer_id";
  normalizedValue: string;
  originalValue: string;
  createdAt: ISODateTime;
}

export interface SiteLocalDateTimeResolution {
  timeZone: "Europe/Belgrade";
  localDate: string;
  localTime: string;
  status: "resolved" | "needs_review";
  instant: ISODateTime | null;
  reason: "invalid_local_datetime" | "ambiguous_local_datetime" | null;
}

/**
 * Resolves a wall-clock value without guessing through daylight-saving changes.
 * R2 uses this before it can create a project: startsAt = start + pickupTime,
 * endsAt = end + returnTime.
 */
export function resolveEuropeBelgradeLocalDateTime(localDate: string, localTime: string): SiteLocalDateTimeResolution {
  const base = { timeZone: "Europe/Belgrade" as const, localDate, localTime };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || !/^\d{2}:\d{2}(?::\d{2})?$/.test(localTime)) {
    return { ...base, status: "needs_review", instant: null, reason: "invalid_local_datetime" };
  }
  const [year, month, day] = localDate.split("-").map(Number);
  const [hour, minute, second = 0] = localTime.split(":").map(Number);
  const nominal = Date.UTC(year!, month! - 1, day!, hour!, minute!, second!);
  if (new Date(nominal).getUTCFullYear() !== year || new Date(nominal).getUTCMonth() !== month! - 1 || new Date(nominal).getUTCDate() !== day || hour! > 23 || minute! > 59 || second! > 59) {
    return { ...base, status: "needs_review", instant: null, reason: "invalid_local_datetime" };
  }
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const expected = { year: String(year).padStart(4, "0"), month: String(month).padStart(2, "0"), day: String(day).padStart(2, "0"), hour: String(hour).padStart(2, "0"), minute: String(minute).padStart(2, "0"), second: String(second).padStart(2, "0") };
  const matches: number[] = [];
  for (let instant = nominal - 3 * 3_600_000; instant <= nominal + 3 * 3_600_000; instant += 60_000) {
    const parts = Object.fromEntries(fmt.formatToParts(new Date(instant)).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
    if (Object.entries(expected).every(([key, value]) => parts[key] === value)) matches.push(instant);
  }
  if (matches.length !== 1) return { ...base, status: "needs_review", instant: null, reason: matches.length === 0 ? "invalid_local_datetime" : "ambiguous_local_datetime" };
  return { ...base, status: "resolved", instant: new Date(matches[0]!).toISOString(), reason: null };
}

/** Deliberately conservative normalizer: never rewrites the compatibility contacts field. */
export function normalizePhoneIdentity(value: string): string | null {
  const normalized = value.trim().replace(/[\s().-]/g, "");
  if (!/^\+?[1-9]\d{6,14}$/.test(normalized)) return null;
  return normalized.startsWith("+") ? normalized : `+${normalized}`;
}
