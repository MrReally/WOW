import type { ID, ISODateTime } from "./common.js";

export type NotificationKind = "issued" | "returned" | "assigned" | "problem" | "info";

export const NOTIFICATION_KINDS: NotificationKind[] = ["assigned", "issued", "returned", "problem", "info"];

export type AdvancedNotificationEvent =
  | "project.assigned"
  | "project.unassigned"
  | "project.invited"
  | "project.invite.responded"
  | "equipment.units.issued"
  | "equipment.unit.returned"
  | "equipment.return.incomplete"
  | "equipment.unit.transferred"
  | "people.user.created";

export const ADVANCED_NOTIFICATION_EVENTS: AdvancedNotificationEvent[] = [
  "project.assigned",
  "project.unassigned",
  "project.invited",
  "project.invite.responded",
  "equipment.units.issued",
  "equipment.unit.returned",
  "equipment.return.incomplete",
  "equipment.unit.transferred",
  "people.user.created",
];

/** Per-user opt-in map: kind → wants it. Missing/true means enabled. */
export type NotificationPrefs = Record<NotificationKind, boolean>;
export type AdvancedNotificationPrefs = Record<AdvancedNotificationEvent, boolean>;

export interface NotificationDTO {
  id: ID;
  userId: ID; // recipient (people id)
  kind: NotificationKind;
  title: string;
  body: string;
  /** In-app deep link, e.g. /projects/:id. */
  link: string | null;
  read: boolean;
  createdAt: ISODateTime;
}

export interface CreateNotificationInput {
  userId: ID;
  kind: NotificationKind;
  title: string;
  body: string;
  link?: string | null;
}

export interface NotificationsService {
  listForUser(userId: ID, opts?: { unreadOnly?: boolean; limit?: number }): Promise<NotificationDTO[]>;
  unreadCount(userId: ID): Promise<number>;
  create(input: CreateNotificationInput): Promise<NotificationDTO>;
  markRead(id: ID, userId: ID): Promise<void>;
  markAllRead(userId: ID): Promise<void>;

  // Per-user delivery preferences (apply to both in-app and Telegram).
  getPrefs(userId: ID): Promise<NotificationPrefs>;
  setPrefs(userId: ID, prefs: NotificationPrefs): Promise<NotificationPrefs>;
  /** Whether the user wants a given kind (defaults to true if never set). */
  isEnabled(userId: ID, kind: NotificationKind): Promise<boolean>;
  getAdvancedPrefs(userId: ID): Promise<AdvancedNotificationPrefs>;
  setAdvancedPrefs(userId: ID, prefs: AdvancedNotificationPrefs): Promise<AdvancedNotificationPrefs>;
  isAdvancedEnabled(userId: ID, event: AdvancedNotificationEvent): Promise<boolean>;
}
