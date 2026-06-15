import crypto from "node:crypto";

// Password hashing with scrypt (built into Node — no dependency). Format:
// scrypt$<salt-hex>$<hash-hex>.

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hash] = parts;
  const computed = crypto.scryptSync(password, salt!, 64).toString("hex");
  const a = Buffer.from(hash!, "hex");
  const b = Buffer.from(computed, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function randomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Short, human-typable temporary password handed to a new user by the admin. */
export function temporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const bytes = crypto.randomBytes(10);
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}
