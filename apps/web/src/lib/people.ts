import type { People } from "@sever/contracts";

export function personName(user: People.UserDTO | null | undefined, fallback = "—"): string {
  return user?.nickname?.trim() || user?.displayName?.trim() || fallback;
}

export function personInitials(user: People.UserDTO | null | undefined): string {
  return personName(user, "·")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "·";
}
