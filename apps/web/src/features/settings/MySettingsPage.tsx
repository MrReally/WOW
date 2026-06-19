import type { Notifications } from "@sever/contracts";
import { NOTIFICATION_KINDS } from "@sever/contracts";
import { Card, Button, SectionTitle, Loading } from "../../ui-kit/index.ts";
import { useTheme } from "../../app/theme.tsx";
import { useSession } from "../../app/session.ts";
import { LOCALE_OPTIONS, useI18n } from "../../app/i18n.tsx";
import { useNotifPrefs, useSetNotifPrefs } from "../notifications/hooks.ts";
import { useCalendarFeed } from "./hooks.ts";

// Personal mini-settings — available to every signed-in user (not the admin
// SettingsPage). Theme + which notifications they want.
export function MySettingsPage() {
  const { theme, toggle } = useTheme();
  const { user } = useSession();
  const { locale, setLocale, t } = useI18n();
  const prefs = useNotifPrefs();
  const setPrefs = useSetNotifPrefs();
  const calendar = useCalendarFeed();
  const current = prefs.data;

  const togglePref = (kind: Notifications.NotificationKind) => {
    if (!current) return;
    setPrefs.mutate({ ...current, [kind]: !current[kind] });
  };

  const kindLabel: Record<Notifications.NotificationKind, string> = {
    assigned: t("notifications.assigned"),
    issued: t("notifications.issued"),
    returned: t("notifications.returned"),
    problem: t("notifications.problem"),
    info: t("notifications.info"),
  };

  return (
    <div className="stack">
      <SectionTitle>{t("settings.title")}</SectionTitle>
      {user && (
        <Card>
          <p className="card__title">{user.displayName}</p>
          <p className="card__subtitle">{user.roleName}{user.email ? ` · ${user.email}` : ""}</p>
        </Card>
      )}

      <SectionTitle>{t("settings.appearance")}</SectionTitle>
      <Card>
        <div className="row row--between">
          <p className="card__title">{t("settings.theme")}: {theme === "dark" ? t("settings.dark") : t("settings.light")}</p>
          <Button variant="secondary" onClick={toggle}>{t("settings.toggle")}</Button>
        </div>
      </Card>

      <SectionTitle>{t("settings.language")}</SectionTitle>
      <Card>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {LOCALE_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={`chip ${locale === option.value ? "chip--accent chip--solid" : "chip--neutral"}`}
              style={{ border: "none", cursor: "pointer" }}
              onClick={() => setLocale(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Card>

      <SectionTitle>{t("settings.notifications")}</SectionTitle>
      <Card>
        <p className="card__subtitle" style={{ marginBottom: 8 }}>
          {t("settings.notificationsHint")}
        </p>
        {prefs.isLoading || !current ? (
          <Loading />
        ) : (
          <div>
            {NOTIFICATION_KINDS.map((k) => (
              <label key={k} className="row row--between" style={{ padding: "9px 0", cursor: "pointer", gap: 12 }}>
                <span style={{ color: "var(--text)" }}>{kindLabel[k]}</span>
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

      <SectionTitle>{t("settings.calendar")}</SectionTitle>
      <Card>
        <p className="card__title">{t("settings.calendarTitle")}</p>
        <p className="card__subtitle" style={{ marginTop: 4 }}>
          {t("settings.calendarHint")}
        </p>
        {calendar.isLoading ? (
          <Loading />
        ) : (
          <>
            <div style={{ marginTop: 10 }}>
              <code style={{ display: "block", wordBreak: "break-all", color: "var(--text)", fontSize: 12 }}>
                {calendar.data?.url ?? "—"}
              </code>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <Button variant="secondary" disabled={!calendar.data?.url} onClick={() => calendar.data?.url && navigator.clipboard?.writeText(calendar.data.url)}>
                {t("common.copy")}
              </Button>
              <Button variant="secondary" disabled={!calendar.data?.url} onClick={() => calendar.data?.url && window.open(calendar.data.url, "_blank")}>
                {t("settings.openFeed")}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
