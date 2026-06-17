import type { Notifications } from "@sever/contracts";
import { NOTIFICATION_KINDS } from "@sever/contracts";
import { Card, Button, SectionTitle, Loading } from "../../ui-kit/index.ts";
import { useTheme } from "../../app/theme.tsx";
import { useSession } from "../../app/session.ts";
import { useNotifPrefs, useSetNotifPrefs } from "../notifications/hooks.ts";

// Personal mini-settings — available to every signed-in user (not the admin
// SettingsPage). Theme + which notifications they want.
const KIND_LABEL: Record<Notifications.NotificationKind, string> = {
  assigned: "Назначения и приглашения на проекты",
  issued: "Выдача оборудования на мои проекты",
  returned: "Возвраты оборудования",
  problem: "Проблемы: некомплект, потери",
  info: "Прочее: снятия с проекта, ответы на приглашения",
};

export function MySettingsPage() {
  const { theme, toggle } = useTheme();
  const { user } = useSession();
  const prefs = useNotifPrefs();
  const setPrefs = useSetNotifPrefs();
  const current = prefs.data;

  const togglePref = (kind: Notifications.NotificationKind) => {
    if (!current) return;
    setPrefs.mutate({ ...current, [kind]: !current[kind] });
  };

  return (
    <div className="stack">
      <SectionTitle>Мои настройки</SectionTitle>
      {user && (
        <Card>
          <p className="card__title">{user.displayName}</p>
          <p className="card__subtitle">{user.roleName}{user.email ? ` · ${user.email}` : ""}</p>
        </Card>
      )}

      <SectionTitle>Оформление</SectionTitle>
      <Card>
        <div className="row row--between">
          <p className="card__title">Тема: {theme === "dark" ? "Тёмная" : "Светлая"}</p>
          <Button variant="secondary" onClick={toggle}>Переключить</Button>
        </div>
      </Card>

      <SectionTitle>Уведомления</SectionTitle>
      <Card>
        <p className="card__subtitle" style={{ marginBottom: 8 }}>
          Отметь, что хочешь получать — приходит и в приложение, и в Telegram.
        </p>
        {prefs.isLoading || !current ? (
          <Loading />
        ) : (
          <div>
            {NOTIFICATION_KINDS.map((k) => (
              <label key={k} className="row row--between" style={{ padding: "9px 0", cursor: "pointer", gap: 12 }}>
                <span style={{ color: "var(--text)" }}>{KIND_LABEL[k]}</span>
                <input
                  type="checkbox"
                  checked={current[k]}
                  disabled={setPrefs.isPending}
                  onChange={() => togglePref(k)}
                  style={{ width: 20, height: 20, accentColor: "var(--accent)", flexShrink: 0 }}
                />
              </label>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
