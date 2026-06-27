import type { Notifications } from "@sever/contracts";
import { ADVANCED_NOTIFICATION_EVENTS, NOTIFICATION_KINDS } from "@sever/contracts";
import { Card, Button, SectionTitle, Loading } from "../../ui-kit/index.ts";
import { useTheme } from "../../app/theme.tsx";
import { useSession } from "../../app/session.ts";
import { LOCALE_OPTIONS, useI18n } from "../../app/i18n.tsx";
import { useAdvancedNotifPrefs, useNotifPrefs, useSetAdvancedNotifPrefs, useSetNotifPrefs } from "../notifications/hooks.ts";
import { useCalendarFeed } from "./hooks.ts";
import { personName } from "../../lib/people.ts";

// Personal mini-settings — available to every signed-in user (not the admin
// SettingsPage). Theme + which notifications they want.
export function MySettingsPage() {
  const { theme, toggle } = useTheme();
  const { can, user } = useSession();
  const { locale, setLocale, t } = useI18n();
  const prefs = useNotifPrefs();
  const setPrefs = useSetNotifPrefs();
  const canAdvancedNotifications = can("notifications.advanced");
  const advancedPrefs = useAdvancedNotifPrefs(canAdvancedNotifications);
  const setAdvancedPrefs = useSetAdvancedNotifPrefs();
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
  const advancedLabel: Record<Notifications.AdvancedNotificationEvent, string> = {
    "project.assigned": "Назначили на проект",
    "project.unassigned": "Сняли с проекта",
    "project.invited": "Отправили приглашение",
    "project.invite.responded": "Ответили на приглашение",
    "equipment.units.issued": "Выдали оборудование",
    "equipment.unit.returned": "Вернули оборудование",
    "equipment.return.incomplete": "Некомплект при возврате",
    "equipment.unit.transferred": "Перемещение между складами",
    "people.user.created": "Создали пользователя",
  };
  const toggleAdvancedPref = (event: Notifications.AdvancedNotificationEvent) => {
    if (!advancedPrefs.data) return;
    setAdvancedPrefs.mutate({ ...advancedPrefs.data, [event]: !advancedPrefs.data[event] });
  };
  const setAllAdvanced = (enabled: boolean) => {
    const next = {} as Notifications.AdvancedNotificationPrefs;
    for (const event of ADVANCED_NOTIFICATION_EVENTS) next[event] = enabled;
    setAdvancedPrefs.mutate(next);
  };

  return (
    <div className="stack">
      <SectionTitle>{t("settings.title")}</SectionTitle>
      {user && (
        <Card>
          <p className="card__title">{personName(user)}</p>
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

      {canAdvancedNotifications && (
        <>
          <SectionTitle>Расширенные уведомления</SectionTitle>
          <Card>
            {advancedPrefs.isLoading || !advancedPrefs.data ? (
              <Loading />
            ) : (
              <>
                <div className="row" style={{ marginBottom: 8 }}>
                  <Button variant="secondary" disabled={setAdvancedPrefs.isPending} onClick={() => setAllAdvanced(true)}>Включить всё</Button>
                  <Button variant="ghost" disabled={setAdvancedPrefs.isPending} onClick={() => setAllAdvanced(false)}>Выключить всё</Button>
                </div>
                {ADVANCED_NOTIFICATION_EVENTS.map((event) => (
                  <label key={event} className="row row--between" style={{ padding: "9px 0", cursor: "pointer", gap: 12 }}>
                    <span style={{ color: "var(--text)" }}>{advancedLabel[event]}</span>
                    <input
                      type="checkbox"
                      checked={advancedPrefs.data[event]}
                      disabled={setAdvancedPrefs.isPending}
                      onChange={() => toggleAdvancedPref(event)}
                      style={{ width: 20, height: 20, accentColor: "var(--accent)", flexShrink: 0 }}
                    />
                  </label>
                ))}
              </>
            )}
          </Card>
        </>
      )}

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
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
