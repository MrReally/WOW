import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Equipment, Projects, Role } from "@sever/contracts";

export type Locale = "ru" | "en" | "sr";

const STORAGE_KEY = "sever.locale";

export const LOCALE_OPTIONS: { value: Locale; label: string }[] = [
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
  { value: "sr", label: "Srpski" },
];

const dictionaries = {
  ru: {
    "common.add": "Добавить",
    "common.close": "Закрыть",
    "common.copy": "Скопировать",
    "common.open": "Открыть",
    "common.save": "Сохранить",
    "common.edit": "Редактировать",
    "common.search": "Поиск",
    "common.ready": "Готово",
    "common.empty": "Пусто",
    "common.total": "Итого",
    "common.margin": "Маржа",
    "common.cost": "Себестоимость",
    "common.client": "Клиент",
    "common.project": "Проект",
    "common.note": "Примечание",
    "common.contacts": "Контакты",
    "common.name": "Название",
    "common.returned": "Возвращено",
    "common.active": "Активно",
    "common.history": "История",
    "common.noNote": "Без примечания",
    "common.noContacts": "Контакты не указаны",
    "common.noProject": "Без проекта",
    "common.system": "Система",
    "common.workspaces": "workspaces",
    "app.mySettings": "Мои настройки",
    "app.logout": "Выйти",
    "workspace.current": "Текущий workspace",
    "workspace.other": "Другие workspaces",
    "workspace.available": "ДОСТУПНО",
    "apex.currentOperation": "ТЕКУЩАЯ ОПЕРАЦИЯ",
    "apex.nextOperation": "БЛИЖАЙШАЯ ОПЕРАЦИЯ",
    "apex.noOperations": "Нет операций",
    "apex.activeNow": "Идут сейчас",
    "apex.upcoming": "Предстоящие",
    "apex.needsAttention": "Требуют внимания",
    "apex.finance": "Финансы",
    "apex.utilization": "Загрузка оборудования",
    "apex.utilizationHint": "Что простаивает, что в дефиците по броням",
    "apex.running": "сейчас",
    "apex.planned": "скоро",
    "apex.problems": "проблемы",
    "apex.noActive": "Нет активных прокатов",
    "apex.noUpcoming": "Нет предстоящих прокатов",
    "apex.onProject": "на проекте",
    "finance.title": "Финансы",
    "finance.accounts": "Счета",
    "finance.clientDebt": "Долг клиентов",
    "finance.payables": "К оплате",
    "finance.transactions": "Транзакции",
    "finance.revenue": "Начислено",
    "finance.paid": "Оплачено",
    "finance.recordedCost": "Затраты",
    "finance.net": "Прогноз",
    "finance.balances": "На счетах",
    "finance.noAccounts": "Нет счетов",
    "finance.noClientDebt": "Клиентских долгов нет",
    "finance.noPayables": "К оплате ничего нет",
    "finance.noTransactions": "Транзакций нет",
    "finance.subrentCost": "Себестоимость субаренды",
    "finance.addedBy": "Добавил",
    "contractors.title": "Contractors",
    "contractors.new": "Новый подрядчик",
    "contractors.add": "Добавить подрядчика",
    "contractors.empty": "Подрядчиков пока нет",
    "contractors.emptyHint": "Добавьте первого поставщика субаренды",
    "contractors.needReturn": "Возвраты",
    "contractors.return": "Вернули",
    "contractors.returnDue": "К возврату",
    "contractors.allClosed": "Всё закрыто",
    "contractors.prices": "История цен",
    "contractors.noActive": "Ничего не висит",
    "contractors.noActiveHint": "По этому подрядчику всё возвращено",
    "contractors.noHistory": "Истории пока нет",
    "contractors.noHistoryHint": "Она появится из строк субаренды в проектах",
    "contractors.activeCost": "Активная себестоимость",
    "contractors.items": "поз.",
    "contractors.clientPrice": "Клиенту",
    "contractors.vendorCost": "Поставщик",
    "contractors.added": "Добавлено",
    "contractors.back": "Вернули",
    "contractors.atUs": "У нас",
    "settings.title": "Мои настройки",
    "settings.appearance": "Оформление",
    "settings.theme": "Тема",
    "settings.dark": "Тёмная",
    "settings.light": "Светлая",
    "settings.toggle": "Переключить",
    "settings.language": "Язык",
    "settings.notifications": "Уведомления",
    "settings.notificationsHint": "Выберите, какие события получать в приложении и Telegram.",
    "settings.calendar": "Google Calendar",
    "settings.calendarTitle": "Односторонняя подписка",
    "settings.calendarHint": "Добавьте ссылку в Google Calendar как календарь по URL. SEVER только публикует события и ничего не читает из Google.",
    "settings.openFeed": "Открыть feed",
    "notifications.assigned": "Назначения и приглашения",
    "notifications.issued": "Выдача оборудования",
    "notifications.returned": "Возвраты оборудования",
    "notifications.problem": "Проблемы",
    "notifications.info": "Прочее",
  },
  en: {
    "common.add": "Add",
    "common.close": "Close",
    "common.copy": "Copy",
    "common.open": "Open",
    "common.save": "Save",
    "common.edit": "Edit",
    "common.search": "Search",
    "common.ready": "Done",
    "common.empty": "Empty",
    "common.total": "Total",
    "common.margin": "Margin",
    "common.cost": "Cost",
    "common.client": "Client",
    "common.project": "Project",
    "common.note": "Note",
    "common.contacts": "Contacts",
    "common.name": "Name",
    "common.returned": "Returned",
    "common.active": "Active",
    "common.history": "History",
    "common.noNote": "No note",
    "common.noContacts": "No contacts",
    "common.noProject": "No project",
    "common.system": "System",
    "common.workspaces": "workspaces",
    "app.mySettings": "My settings",
    "app.logout": "Log out",
    "workspace.current": "Current workspace",
    "workspace.other": "Other workspaces",
    "workspace.available": "AVAILABLE",
    "apex.currentOperation": "CURRENT OPERATION",
    "apex.nextOperation": "NEXT OPERATION",
    "apex.noOperations": "No operations",
    "apex.activeNow": "Active now",
    "apex.upcoming": "Upcoming",
    "apex.needsAttention": "Needs attention",
    "apex.finance": "Finance",
    "apex.utilization": "Equipment load",
    "apex.utilizationHint": "Idle stock and reservation shortages",
    "apex.running": "active",
    "apex.planned": "planned",
    "apex.problems": "issues",
    "apex.noActive": "No active rentals",
    "apex.noUpcoming": "No upcoming rentals",
    "apex.onProject": "on project",
    "finance.title": "Finance",
    "finance.accounts": "Accounts",
    "finance.clientDebt": "Receivables",
    "finance.payables": "Payables",
    "finance.transactions": "Transactions",
    "finance.revenue": "Revenue",
    "finance.paid": "Paid",
    "finance.recordedCost": "Costs",
    "finance.net": "Forecast",
    "finance.balances": "Balances",
    "finance.noAccounts": "No accounts",
    "finance.noClientDebt": "No receivables",
    "finance.noPayables": "No payables",
    "finance.noTransactions": "No transactions",
    "finance.subrentCost": "Subrent cost",
    "finance.addedBy": "Added by",
    "contractors.title": "Contractors",
    "contractors.new": "New contractor",
    "contractors.add": "Add contractor",
    "contractors.empty": "No contractors yet",
    "contractors.emptyHint": "Add the first subrent supplier",
    "contractors.needReturn": "Returns",
    "contractors.return": "Returned",
    "contractors.returnDue": "Return due",
    "contractors.allClosed": "All clear",
    "contractors.prices": "Price history",
    "contractors.noActive": "Nothing open",
    "contractors.noActiveHint": "Everything is returned for this contractor",
    "contractors.noHistory": "No history yet",
    "contractors.noHistoryHint": "History appears from project subrent lines",
    "contractors.activeCost": "Open cost",
    "contractors.items": "items",
    "contractors.clientPrice": "Client",
    "contractors.vendorCost": "Vendor",
    "contractors.added": "Added",
    "contractors.back": "Returned",
    "contractors.atUs": "With us",
    "settings.title": "My settings",
    "settings.appearance": "Appearance",
    "settings.theme": "Theme",
    "settings.dark": "Dark",
    "settings.light": "Light",
    "settings.toggle": "Switch",
    "settings.language": "Language",
    "settings.notifications": "Notifications",
    "settings.notificationsHint": "Choose which events you receive in the app and Telegram.",
    "settings.calendar": "Google Calendar",
    "settings.calendarTitle": "One-way subscription",
    "settings.calendarHint": "Add this URL to Google Calendar. SEVER only publishes events and never reads Google data.",
    "settings.openFeed": "Open feed",
    "notifications.assigned": "Assignments and invites",
    "notifications.issued": "Equipment issue",
    "notifications.returned": "Equipment returns",
    "notifications.problem": "Issues",
    "notifications.info": "Other",
  },
  sr: {
    "common.add": "Dodaj",
    "common.close": "Zatvori",
    "common.copy": "Kopiraj",
    "common.open": "Otvori",
    "common.save": "Sačuvaj",
    "common.edit": "Izmeni",
    "common.search": "Pretraga",
    "common.ready": "Gotovo",
    "common.empty": "Prazno",
    "common.total": "Ukupno",
    "common.margin": "Marža",
    "common.cost": "Trošak",
    "common.client": "Klijent",
    "common.project": "Projekat",
    "common.note": "Napomena",
    "common.contacts": "Kontakti",
    "common.name": "Naziv",
    "common.returned": "Vraćeno",
    "common.active": "Aktivno",
    "common.history": "Istorija",
    "common.noNote": "Bez napomene",
    "common.noContacts": "Kontakti nisu uneti",
    "common.noProject": "Bez projekta",
    "common.system": "Sistem",
    "common.workspaces": "radnih zona",
    "app.mySettings": "Moja podešavanja",
    "app.logout": "Odjavi se",
    "workspace.current": "Trenutna zona",
    "workspace.other": "Druge zone",
    "workspace.available": "DOSTUPNO",
    "apex.currentOperation": "AKTIVNA OPERACIJA",
    "apex.nextOperation": "SLEDEĆA OPERACIJA",
    "apex.noOperations": "Nema operacija",
    "apex.activeNow": "U toku",
    "apex.upcoming": "Predstoji",
    "apex.needsAttention": "Pažnja",
    "apex.finance": "Finansije",
    "apex.utilization": "Opterećenje opreme",
    "apex.utilizationHint": "Slobodna oprema i manjkovi u rezervacijama",
    "apex.running": "u toku",
    "apex.planned": "uskoro",
    "apex.problems": "problemi",
    "apex.noActive": "Nema aktivnih renti",
    "apex.noUpcoming": "Nema predstojećih renti",
    "apex.onProject": "na projektu",
    "finance.title": "Finansije",
    "finance.accounts": "Računi",
    "finance.clientDebt": "Potraživanja",
    "finance.payables": "Obaveze",
    "finance.transactions": "Transakcije",
    "finance.revenue": "Fakturisano",
    "finance.paid": "Plaćeno",
    "finance.recordedCost": "Troškovi",
    "finance.net": "Prognoza",
    "finance.balances": "Stanja",
    "finance.noAccounts": "Nema računa",
    "finance.noClientDebt": "Nema potraživanja",
    "finance.noPayables": "Nema obaveza",
    "finance.noTransactions": "Nema transakcija",
    "finance.subrentCost": "Trošak subrente",
    "finance.addedBy": "Dodao",
    "contractors.title": "Contractors",
    "contractors.new": "Novi izvođač",
    "contractors.add": "Dodaj izvođača",
    "contractors.empty": "Još nema izvođača",
    "contractors.emptyHint": "Dodajte prvog dobavljača subrente",
    "contractors.needReturn": "Povraćaji",
    "contractors.return": "Vraćeno",
    "contractors.returnDue": "Za povrat",
    "contractors.allClosed": "Sve čisto",
    "contractors.prices": "Istorija cena",
    "contractors.noActive": "Ništa otvoreno",
    "contractors.noActiveHint": "Sve je vraćeno ovom izvođaču",
    "contractors.noHistory": "Još nema istorije",
    "contractors.noHistoryHint": "Istorija nastaje iz subrent stavki u projektima",
    "contractors.activeCost": "Otvoren trošak",
    "contractors.items": "stavki",
    "contractors.clientPrice": "Klijent",
    "contractors.vendorCost": "Dobavljač",
    "contractors.added": "Dodato",
    "contractors.back": "Vraćeno",
    "contractors.atUs": "Kod nas",
    "settings.title": "Moja podešavanja",
    "settings.appearance": "Izgled",
    "settings.theme": "Tema",
    "settings.dark": "Tamna",
    "settings.light": "Svetla",
    "settings.toggle": "Promeni",
    "settings.language": "Jezik",
    "settings.notifications": "Obaveštenja",
    "settings.notificationsHint": "Izaberite događaje za aplikaciju i Telegram.",
    "settings.calendar": "Google Calendar",
    "settings.calendarTitle": "Jednosmerna pretplata",
    "settings.calendarHint": "Dodajte URL u Google Calendar. SEVER samo objavljuje događaje i ne čita Google podatke.",
    "settings.openFeed": "Otvori feed",
    "notifications.assigned": "Zaduženja i pozivi",
    "notifications.issued": "Izdavanje opreme",
    "notifications.returned": "Povraćaj opreme",
    "notifications.problem": "Problemi",
    "notifications.info": "Ostalo",
  },
} satisfies Record<Locale, Record<string, string>>;

type Key = keyof typeof dictionaries.ru;

const unitStatus: Record<Locale, Record<Equipment.UnitStatus, string>> = {
  ru: { in_stock: "На складе", reserved: "Резерв", on_project: "На проекте", in_repair: "Ремонт", at_contractor: "Сервис", lost: "Утеря" },
  en: { in_stock: "In stock", reserved: "Reserved", on_project: "On project", in_repair: "Repair", at_contractor: "Service", lost: "Lost" },
  sr: { in_stock: "Na stanju", reserved: "Rezervisano", on_project: "Na projektu", in_repair: "Servis", at_contractor: "Servis", lost: "Izgubljeno" },
};

const projectStatus: Record<Locale, Record<Projects.ProjectStatus, string>> = {
  ru: { draft: "Черновик", confirmed: "Подтверждён", in_progress: "В работе", completed: "Завершён", cancelled: "Отменён" },
  en: { draft: "Draft", confirmed: "Confirmed", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled" },
  sr: { draft: "Nacrt", confirmed: "Potvrđeno", in_progress: "U toku", completed: "Završeno", cancelled: "Otkazano" },
};

const role: Record<Locale, Record<Role, string>> = {
  ru: { admin: "Владелец / Админ", warehouse: "Склад", tech: "Монтажник" },
  en: { admin: "Owner / Admin", warehouse: "Warehouse", tech: "Technician" },
  sr: { admin: "Vlasnik / Admin", warehouse: "Magacin", tech: "Tehničar" },
};

const problemKind: Record<Locale, Record<string, string>> = {
  ru: { incomplete_return: "Некомплект", reservation_conflict: "Конфликт", overdue_debt: "Просрочка", contractor_return_due: "Вернуть", unit_lost: "Утеря" },
  en: { incomplete_return: "Incomplete", reservation_conflict: "Conflict", overdue_debt: "Overdue", contractor_return_due: "Return", unit_lost: "Lost" },
  sr: { incomplete_return: "Manjak", reservation_conflict: "Konflikt", overdue_debt: "Kašnjenje", contractor_return_due: "Vratiti", unit_lost: "Izgubljeno" },
};

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: Key) => string;
  unitStatusLabel: Record<Equipment.UnitStatus, string>;
  projectStatusLabel: Record<Projects.ProjectStatus, string>;
  roleLabel: Record<Role, string>;
  problemKindLabel: Record<string, string>;
  money: (amount: number, currency: string) => string;
  eur: (amount: number) => string;
  dateTime: (iso: string) => string;
  dateRange: (startIso: string, endIso: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function readLocale(): Locale {
  const saved = typeof localStorage === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
  return saved === "en" || saved === "sr" || saved === "ru" ? saved : "ru";
}

const intlLocale = (locale: Locale) => (locale === "ru" ? "ru-RU" : locale === "sr" ? "sr-RS" : "en-US");
const pad = (n: number) => String(n).padStart(2, "0");
const fmtDate = (d: Date) => `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readLocale);
  const setLocale = (next: Locale) => {
    setLocaleState(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const t = (key: Key) => dictionaries[locale][key] ?? dictionaries.ru[key] ?? key;
    const money = (amount: number, currency: string) => {
      try {
        return new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency, maximumFractionDigits: currency === "EUR" ? 0 : 2 }).format(amount);
      } catch {
        return `${amount} ${currency}`;
      }
    };
    const dateTime = (iso: string) => {
      const d = new Date(iso);
      return `${fmtDate(d)} ${fmtTime(d)}`;
    };
    const dateRange = (startIso: string, endIso: string) => {
      const s = new Date(startIso);
      const e = new Date(endIso);
      return fmtDate(s) === fmtDate(e)
        ? `${fmtDate(s)} ${fmtTime(s)}-${fmtTime(e)}`
        : `${fmtDate(s)} ${fmtTime(s)} -> ${fmtDate(e)} ${fmtTime(e)}`;
    };
    return {
      locale,
      setLocale,
      t,
      unitStatusLabel: unitStatus[locale],
      projectStatusLabel: projectStatus[locale],
      roleLabel: role[locale],
      problemKindLabel: problemKind[locale],
      money,
      eur: (amount: number) => money(amount, "EUR"),
      dateTime,
      dateRange,
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
