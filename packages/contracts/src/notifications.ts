import type { ID, ISODateTime } from "./common.js";

export type NotificationKind = "issued" | "returned" | "assigned" | "problem" | "info";

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
}
