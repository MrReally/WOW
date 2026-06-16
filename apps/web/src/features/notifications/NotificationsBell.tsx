import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, Button, Dot, EmptyState, Loading } from "../../ui-kit/index.ts";
import { dateTime } from "../../lib/labels.ts";
import { useUnreadCount, useNotifications, useMarkRead, useMarkAllRead } from "./hooks.ts";
import "./notifications.css";

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount();
  const list = useNotifications(open);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const navigate = useNavigate();
  const count = unread.data?.count ?? 0;

  return (
    <>
      <button className="bell" onClick={() => setOpen(true)} aria-label="Уведомления">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M6 9a6 6 0 1112 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M9.5 19a2.5 2.5 0 005 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        {count > 0 && <span className="bell__badge">{count > 9 ? "9+" : count}</span>}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Уведомления">
        {count > 0 && (
          <div style={{ marginBottom: 12 }}>
            <Button variant="secondary" block onClick={() => markAll.mutate()}>Прочитать все</Button>
          </div>
        )}
        {list.isLoading ? (
          <Loading />
        ) : (list.data ?? []).length === 0 ? (
          <EmptyState title="Нет уведомлений" />
        ) : (
          <div className="stack">
            {(list.data ?? []).map((n) => (
              <div
                key={n.id}
                className="card card--tappable"
                style={{ opacity: n.read ? 0.6 : 1 }}
                onClick={() => {
                  if (!n.read) markRead.mutate(n.id);
                  if (n.link) {
                    setOpen(false);
                    navigate(n.link);
                  }
                }}
              >
                <div className="row" style={{ gap: 10 }}>
                  {!n.read && <Dot tone="accent" />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="card__title">{n.title}</p>
                    <p className="card__subtitle" style={{ color: "var(--text2)" }}>{n.body}</p>
                    <p className="card__subtitle">{dateTime(n.createdAt)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Sheet>
    </>
  );
}
