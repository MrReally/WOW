import { env } from "../env.js";
import { formatDateTimeValue, projectRentalDays, type AppSettings, type Equipment, type Finance, type People, type Projects } from "@sever/contracts";
import { evaluateTelegramAmount } from "./telegramFinance.js";

// Minimal Telegram bot via long polling (getUpdates) — works without a public
// HTTPS endpoint, so it runs anywhere the container has internet. Only starts
// when a bot token is configured.
//
// Linking — two ways, both end with the person's numeric chat id saved onto
// their account (after which notifications deliver to them):
//   1. Deep link  t.me/<bot>?start=<userId>  → /start <userId> (most robust).
//   2. By @username: an admin types the person's @username on their card; the
//      person just opens the bot and presses Start, and we match on from.username.
// Until linked, the account's telegram_id holds the pending @username; pressing
// Start replaces it with the numeric chat id.

/** Normalize a Telegram handle for comparison: drop a leading @, lowercase. */
const normHandle = (s: string | null | undefined): string => (s ?? "").trim().replace(/^@/, "").toLowerCase();

const tg = (method: string, body: unknown) =>
  fetch(`https://api.telegram.org/bot${env.auth.telegramBotToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
    .then((r) => r.json() as Promise<{ ok: boolean; result?: unknown; description?: string }>)
    .catch(() => null);

let cachedUsername: string | null = null;
export async function getBotUsername(): Promise<string | null> {
  if (!env.auth.telegramBotToken) return null;
  if (cachedUsername) return cachedUsername;
  const res = await tg("getMe", {});
  const username = (res?.result as { username?: string } | undefined)?.username ?? null;
  cachedUsername = username;
  return username;
}

/** Tapping an inline button (e.g. accept/decline an invite). The handler
 *  returns the text to replace the original message with, or null to ignore. */
export type CallbackHandler = (data: string, fromChatId: string) => Promise<string | null>;

interface BotDeps {
  people: People.PeopleService;
  appSettings: AppSettings.AppSettingsService;
  finance?: Finance.FinanceService;
  /** Optional while the bot is used only for applications/inbox in older deployments. */
  projects?: Projects.ProjectsService;
  equipment?: Equipment.EquipmentService;
  onCallback?: CallbackHandler;
}

type ApplicationField = "firstName" | "lastName" | "patronymic" | "nickname" | "email" | "birthDate" | "languages" | "about" | "source" | "photoFileId";
type BotLang = "ru" | "sr" | "en";
interface ApplicationSession {
  summaryMessageId: number | null;
  questionMessageId: number | null;
  editingField: ApplicationField | null;
  lang: BotLang | null;
  draft: Partial<People.SubmitCrewApplicationInput>;
  username: string | null;
  lastError: string | null;
  usedSingleAnswers: boolean;
  submitted: boolean;
}
interface OperatorSession {
  targetTelegramId: string | null;
  menuMessageIds: number[];
}

type FinanceSessionStage = "account" | "kind" | "category" | "amount" | "note" | "confirm";
type FinanceSessionMode = "transaction" | "account_adjustment";
interface FinanceSession {
  userId: string;
  requestKey: string;
  mode: FinanceSessionMode;
  stage: FinanceSessionStage;
  accountId: string | null;
  kind: Finance.TxKind | null;
  category: Finance.TxCategory | null;
  amount: number | null;
  expression: string | null;
  note: string | null;
  /** A transaction started from a project card is always attributed to it. */
  projectId: string | null;
  assignmentId: string | null;
  contractorId: string | null;
  expiresAt: number;
}

interface ProjectSession {
  userId: string;
  /** Search input is handled only while this flag is set, never as a global text command. */
  awaitingSearch: boolean;
  selectedProjectId: string | null;
  expiresAt: number;
}

interface EquipmentSession {
  userId: string;
  awaitingSearch: boolean;
  selectedUnitId: string | null;
  targetWarehouseId: string | null;
  expiresAt: number;
}

/** State is deliberately only navigation state: all displayed data is loaded
 * again from the owning services before a command changes anything. */
interface ReservationSession {
  userId: string;
  projectId: string;
  awaitingModelSearch: boolean;
  selectedReservationId: string | null;
  selectedUnitIds: string[];
  expiresAt: number;
}

interface ProblemSession {
  userId: string;
  projectId: string;
  selectedRoleId: string | null;
  expiresAt: number;
}

const LANG_LABELS: Record<BotLang, string> = { ru: "Русский", sr: "Srpski", en: "English" };
const CHOOSE_LANGUAGE_TEXT = "<b>SEVER Crew</b>\nРусский · Srpski · English";
const INACTIVE_TEXT = "No active application. /start";
const CANCELLED_TEXT = "Cancelled / Otkazano / Отменено. /start";

const COPY = {
  ru: {
    chooseLanguage: "<b>SEVER Crew</b>\nВыберите язык анкеты.",
    intro: "<b>Анкета SEVER Crew</b>\nЗаполните короткую форму. Можно отвечать по одному вопросу или сразу списком по номерам.",
    appStatus: "Анкета",
    sentStatus: "Анкета · отправлена",
    attached: "приложено",
    empty: "—",
    edit: "Редактировать",
    submit: "Отправить",
    done: "Готово",
    editPrompt: "Что редактируем?",
    completeQuestion: "<b>Анкета заполнена</b>\nХотите отправить?",
    listHint: ["Можно ответить сразу списком:", "<code>1. Александр</code>", "<code>2. Иванов</code>", "<code>3. -</code>"],
    required: (label: string) => `Не заполнено поле «${label}».`,
    cancelled: "Анкета отменена. Чтобы начать заново, нажмите /start.",
    inactive: "Анкета не активна. Нажмите /start.",
    emptyField: "Поле не должно быть пустым.",
    invalidEmail: "Пожалуйста, отправьте корректный email.",
    invalidDate: "Не понял дату. Формат: ДД.ММ.ГГГГ или ДД.ММ.ГГ.",
    photoAsImage: "Фото нужно отправить как изображение.",
    alreadyComplete: "Анкета уже заполнена. Можно отправить или отредактировать поле.",
    submitFailed: "Не удалось отправить анкету.",
    duplicateApplication: "Анкета уже отправлена.",
    userExists: "Такой пользователь уже есть.",
    submitted: "✅ Анкета отправлена. Мы вернёмся с ответом после просмотра.",
    fieldLabels: {
      firstName: "Имя",
      lastName: "Фамилия",
      patronymic: "Отчество",
      nickname: "Ник",
      email: "Email",
      birthDate: "Дата рождения",
      languages: "Языки",
      about: "О себе",
      source: "Источник",
      photoFileId: "Фото",
    },
    questions: {
      firstName: "Как вас зовут?",
      lastName: "Какая у вас фамилия?",
      patronymic: "Отчество, если есть. Если нет — отправьте «-».",
      nickname: "Какой короткий ник использовать в таймингах и списках?",
      email: "На какой email можно с вами связаться?",
      birthDate: "Какая у вас дата рождения? Формат: ДД.ММ.ГГГГ или ДД.ММ.ГГ.",
      languages: "Какие языки вы знаете и на каком уровне?",
      about: "Коротко расскажите о себе и опыте.",
      source: "Откуда вы узнали о SEVER? Кто пригласил или где нашли бота?",
      photoFileId: "Отправьте своё фото",
    },
    noPatronymic: ["нет"],
    yes: ["да", "д", "ага", "отправить", "отправляй"],
    cancel: ["отмена"],
  },
  sr: {
    chooseLanguage: "<b>SEVER Crew</b>\nIzaberite jezik prijave.",
    intro: "<b>SEVER Crew prijava</b>\nPopunite kratku formu. Možete odgovarati po jednom pitanju ili poslati odgovore kao numerisanu listu.",
    appStatus: "Prijava",
    sentStatus: "Prijava · poslata",
    attached: "priloženo",
    empty: "—",
    edit: "Izmeni",
    submit: "Pošalji",
    done: "Gotovo",
    editPrompt: "Šta želite da izmenite?",
    completeQuestion: "<b>Prijava je popunjena</b>\nŽelite li da je pošaljete?",
    listHint: ["Možete odgovoriti i kao listu:", "<code>1. Aleksandar</code>", "<code>2. Ivanović</code>", "<code>3. -</code>"],
    required: (label: string) => `Nije popunjeno polje „${label}“.`,
    cancelled: "Prijava je otkazana. Za novi početak pritisnite /start.",
    inactive: "Prijava nije aktivna. Pritisnite /start.",
    emptyField: "Polje ne sme biti prazno.",
    invalidEmail: "Pošaljite ispravan email.",
    invalidDate: "Ne razumem datum. Format: DD.MM.YYYY ili DD.MM.YY.",
    photoAsImage: "Fotografiju pošaljite kao sliku.",
    alreadyComplete: "Prijava je već popunjena. Možete je poslati ili izmeniti polje.",
    submitFailed: "Nije uspelo slanje prijave.",
    duplicateApplication: "Prijava je već poslata.",
    userExists: "Takav korisnik već postoji.",
    submitted: "✅ Prijava je poslata. Javićemo se posle pregleda.",
    fieldLabels: {
      firstName: "Ime",
      lastName: "Prezime",
      patronymic: "Srednje ime",
      nickname: "Nadimak",
      email: "Email",
      birthDate: "Datum rođenja",
      languages: "Jezici",
      about: "O sebi",
      source: "Izvor",
      photoFileId: "Fotografija",
    },
    questions: {
      firstName: "Kako se zovete?",
      lastName: "Koje je vaše prezime?",
      patronymic: "Srednje ime, ako ga imate. Ako nemate, pošaljite „-“.",
      nickname: "Koji kratak nadimak da koristimo u rasporedima i listama?",
      email: "Na koji email možemo da vas kontaktiramo?",
      birthDate: "Koji je vaš datum rođenja? Format: DD.MM.YYYY ili DD.MM.YY.",
      languages: "Koje jezike znate i na kom nivou?",
      about: "Ukratko napišite nešto o sebi i iskustvu.",
      source: "Kako ste saznali za SEVER? Ko vas je pozvao ili gde ste našli bota?",
      photoFileId: "Pošaljite svoju fotografiju",
    },
    noPatronymic: ["ne", "nemam", "nema"],
    yes: ["da", "pošalji", "posalji", "šalji", "salji"],
    cancel: ["otkaži", "otkazi", "odustani"],
  },
  en: {
    chooseLanguage: "<b>SEVER Crew</b>\nChoose the application language.",
    intro: "<b>SEVER Crew application</b>\nFill out a short form. You can answer one question at a time or send a numbered list.",
    appStatus: "Application",
    sentStatus: "Application · sent",
    attached: "attached",
    empty: "—",
    edit: "Edit",
    submit: "Send",
    done: "Done",
    editPrompt: "What would you like to edit?",
    completeQuestion: "<b>Application complete</b>\nDo you want to send it?",
    listHint: ["You can also answer as a list:", "<code>1. Alexander</code>", "<code>2. Ivanov</code>", "<code>3. -</code>"],
    required: (label: string) => `The “${label}” field is missing.`,
    cancelled: "Application cancelled. Press /start to begin again.",
    inactive: "No active application. Press /start.",
    emptyField: "This field cannot be empty.",
    invalidEmail: "Please send a valid email.",
    invalidDate: "I could not read the date. Format: DD.MM.YYYY or DD.MM.YY.",
    photoAsImage: "Please send the photo as an image.",
    alreadyComplete: "The application is complete. You can send it or edit a field.",
    submitFailed: "Could not send the application.",
    duplicateApplication: "The application has already been sent.",
    userExists: "This user already exists.",
    submitted: "✅ Application sent. We will get back to you after review.",
    fieldLabels: {
      firstName: "First name",
      lastName: "Last name",
      patronymic: "Middle name",
      nickname: "Nickname",
      email: "Email",
      birthDate: "Date of birth",
      languages: "Languages",
      about: "About",
      source: "Source",
      photoFileId: "Photo",
    },
    questions: {
      firstName: "What is your first name?",
      lastName: "What is your last name?",
      patronymic: "Middle name, if you have one. If not, send “-”.",
      nickname: "What short nickname should we use in schedules and lists?",
      email: "Which email can we use to contact you?",
      birthDate: "What is your date of birth? Format: DD.MM.YYYY or DD.MM.YY.",
      languages: "Which languages do you know, and at what level?",
      about: "Briefly tell us about yourself and your experience.",
      source: "How did you hear about SEVER? Who invited you or where did you find the bot?",
      photoFileId: "Send your photo",
    },
    noPatronymic: ["no", "none", "n/a"],
    yes: ["yes", "y", "send", "submit"],
    cancel: ["cancel"],
  },
} satisfies Record<BotLang, {
  chooseLanguage: string;
  intro: string;
  appStatus: string;
  sentStatus: string;
  attached: string;
  empty: string;
  edit: string;
  submit: string;
  done: string;
  editPrompt: string;
  completeQuestion: string;
  listHint: string[];
  required: (label: string) => string;
  cancelled: string;
  inactive: string;
  emptyField: string;
  invalidEmail: string;
  invalidDate: string;
  photoAsImage: string;
  alreadyComplete: string;
  submitFailed: string;
  duplicateApplication: string;
  userExists: string;
  submitted: string;
  fieldLabels: Record<ApplicationField, string>;
  questions: Record<ApplicationField, string>;
  noPatronymic: string[];
  yes: string[];
  cancel: string[];
}>;

const APPLICATION_FIELDS: { field: ApplicationField; optional?: boolean }[] = [
  { field: "firstName" },
  { field: "lastName" },
  { field: "patronymic", optional: true },
  { field: "nickname" },
  { field: "email" },
  { field: "birthDate" },
  { field: "languages" },
  { field: "about" },
  { field: "source" },
  { field: "photoFileId" },
];

interface Update {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    photo?: { file_id: string; file_size?: number; width?: number; height?: number }[];
    from?: { id?: number; username?: string; first_name?: string; last_name?: string };
    chat: { id: number; type?: string };
  };
  callback_query?: { id: string; data?: string; from: { id: number; username?: string }; message?: { chat: { id: number }; message_id: number } };
}

export function startTelegramBot(deps: BotDeps): void {
  const { people, finance, projects, equipment, onCallback } = deps;
  if (!env.auth.telegramBotToken) return;
  const send = async (
    chatId: string | number,
    text: string,
    replyMarkup?: unknown,
    opts: { log?: boolean; direction?: People.TelegramDialogDirection } = {}
  ) => {
    const res = await tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", reply_markup: replyMarkup });
    const messageId = (res?.result as { message_id?: number } | undefined)?.message_id;
    if (res?.ok && typeof messageId === "number" && opts.log !== false && /^\d+$/.test(String(chatId))) {
      await people.logTelegramDialogMessage({
        telegramId: String(chatId),
        direction: opts.direction ?? "bot",
        messageType: "text",
        text,
        telegramMessageId: messageId,
      });
    }
    return res;
  };
  const edit = (chatId: string | number, messageId: number, text: string, replyMarkup?: unknown) =>
    tg("editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", reply_markup: replyMarkup });
  const del = async (chatId: string | number, messageId: number) => {
    const res = await tg("deleteMessage", { chat_id: chatId, message_id: messageId });
    if (res?.ok && /^\d+$/.test(String(chatId))) {
      await people.markTelegramDialogMessageDeleted(String(chatId), messageId);
    }
    return res;
  };
  const clearControlMessages = async (chatId: string) => {
    const ids = controlMessageIds.get(chatId) ?? [];
    controlMessageIds.delete(chatId);
    await Promise.all(ids.map((messageId) => del(chatId, messageId)));
  };
  const sendControl = async (chatId: string, text: string, replyMarkup?: unknown) => {
    await clearControlMessages(chatId);
    const result = await send(chatId, text, replyMarkup, { log: false });
    const messageId = (result?.result as { message_id?: number } | undefined)?.message_id;
    if (typeof messageId === "number") controlMessageIds.set(chatId, [messageId]);
    return result;
  };
  const publicName = (user: { nickname?: string | null; displayName?: string | null }) =>
    user.nickname?.trim() || user.displayName?.trim() || "аккаунт";
  const sessions = new Map<string, ApplicationSession>();
  const operatorSessions = new Map<string, OperatorSession>();
  const financeSessions = new Map<string, FinanceSession>();
  const projectSessions = new Map<string, ProjectSession>();
  const equipmentSessions = new Map<string, EquipmentSession>();
  const reservationSessions = new Map<string, ReservationSession>();
  const problemSessions = new Map<string, ProblemSession>();
  /** Telegram retries a callback if a client is slow. Mutating callbacks are
   * suppressed briefly; the services remain the final consistency boundary. */
  const recentCallbacks = new Map<string, number>();
  /** Bot-owned navigation messages, replaced rather than accumulating in chat. */
  const controlMessageIds = new Map<string, number[]>();
  let offset = 0;

  const copy = (session: ApplicationSession) => COPY[session.lang ?? "ru"];
  const steps = (session: ApplicationSession) =>
    APPLICATION_FIELDS.map((step) => ({
      ...step,
      label: copy(session).fieldLabels[step.field],
      question: copy(session).questions[step.field],
    }));
  const languageKeyboard = {
    inline_keyboard: [[
      { text: LANG_LABELS.ru, callback_data: "app:lang:ru" },
      { text: LANG_LABELS.sr, callback_data: "app:lang:sr" },
      { text: LANG_LABELS.en, callback_data: "app:lang:en" },
    ]],
  };
  const escapeHtml = (value: string | null | undefined) => (value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const stripHtml = (value: string) => value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const normalizeIntent = (value: string): string =>
    value.trim().toLowerCase().replace(/[.!?,;:]+$/g, "").trim();
  const languageFromText = (value: string): BotLang | null => {
    const normalized = normalizeIntent(value);
    if (["ru", "rus", "russian", "русский", "рус"].includes(normalized)) return "ru";
    if (["sr", "serbian", "srpski", "српски", "serb"].includes(normalized)) return "sr";
    if (["en", "eng", "english", "английский"].includes(normalized)) return "en";
    return null;
  };
  const submitError = (session: ApplicationSession, err: unknown): string => {
    const c = copy(session);
    const message = err instanceof Error ? err.message : "";
    if (message.includes("анкета уже отправлена")) return c.duplicateApplication;
    if (message.includes("такой пользователь уже есть")) return c.userExists;
    return message || c.submitFailed;
  };
  const normalizeBirthYear = (year: number): number => {
    if (year >= 100) return year;
    return year >= 31 ? 1900 + year : 2000 + year;
  };
  const finishDate = (day: number, month: number, year: number): string | null => {
    const fullYear = normalizeBirthYear(year);
    if (fullYear < 1900 || fullYear > new Date().getFullYear()) return null;
    const d = new Date(Date.UTC(fullYear, month - 1, day));
    if (d.getUTCFullYear() !== fullYear || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
    return `${fullYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };
  const parseDate = (value: string): string | null => {
    const nums = value.trim().split(/[.\-/\s]+/).filter(Boolean).map((token) => Number(token));
    if (nums.length < 3) return null;
    if (nums.some((n) => !Number.isInteger(n))) return null;
    const [day, month, year] = nums;
    return finishDate(day!, month!, year!);
  };
  const formatDateForDisplay = (iso: string | null | undefined): string => {
    const match = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}.${match[2]}.${match[1]}` : "—";
  };
  const displayValue = (session: ApplicationSession, field: ApplicationField): string => {
    const c = copy(session);
    const value = session.draft[field];
    if (field === "patronymic" && (value === null || value === "")) return c.empty;
    if (field === "photoFileId") return value ? c.attached : c.empty;
    if (field === "birthDate") return typeof value === "string" ? formatDateForDisplay(value) : c.empty;
    return typeof value === "string" && value.trim() ? value : c.empty;
  };
  const hasField = (session: ApplicationSession, field: ApplicationField): boolean => {
    const step = APPLICATION_FIELDS.find((item) => item.field === field);
    const value = session.draft[field];
    if (step?.optional) return true;
    return typeof value === "string" && value.trim().length > 0;
  };
  const firstRequiredMissingField = (session: ApplicationSession): ApplicationField | null =>
    APPLICATION_FIELDS.find((step) => !hasField(session, step.field))?.field ?? null;
  const firstUnansweredField = (session: ApplicationSession): ApplicationField | null =>
    APPLICATION_FIELDS.find((step) => session.draft[step.field] === undefined)?.field ?? null;
  const validateTextField = (session: ApplicationSession, field: ApplicationField, value: string): string | null => {
    const c = copy(session);
    const v = value.trim();
    if (field === "patronymic" && (v === "-" || c.noPatronymic.includes(v.toLowerCase()))) return "";
    if (!v) return c.emptyField;
    if (field === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return c.invalidEmail;
    if (field === "birthDate" && !parseDate(v)) return c.invalidDate;
    return null;
  };
  const applyTextField = (session: ApplicationSession, field: ApplicationField, value: string): string | null => {
    const c = copy(session);
    if (field === "photoFileId") return c.photoAsImage;
    const error = validateTextField(session, field, value);
    if (error) return error;
    if (field === "birthDate") {
      session.draft.birthDate = parseDate(value)!;
    } else if (field === "patronymic") {
      const v = value.trim();
      session.draft.patronymic = v === "-" || c.noPatronymic.includes(v.toLowerCase()) ? null : v;
    } else {
      (session.draft as Record<string, unknown>)[field] = value.trim();
    }
    return null;
  };
  const parseNumberedAnswers = (text: string): { field: ApplicationField; value: string }[] => {
    const out: { field: ApplicationField; value: string }[] = [];
    for (const line of text.split(/\n+/)) {
      // A dot needs a separating space: otherwise 06.11.1998 becomes
      // answer #6 with the invalid date value "11.1998".
      const match = line.match(/^\s*(\d{1,2})(?:\.\s+|\)\s*)(.+)\s*$/);
      if (!match) continue;
      const step = APPLICATION_FIELDS[Number(match[1]) - 1];
      if (step && step.field !== "photoFileId") out.push({ field: step.field, value: match[2]!.trim() });
    }
    return out;
  };
  const isAffirmative = (session: ApplicationSession, text: string): boolean => {
    const normalized = normalizeIntent(text);
    return copy(session).yes.includes(normalized);
  };
  const keyboard = (session: ApplicationSession, editMode = false) => {
    const c = copy(session);
    if (session.submitted) return { inline_keyboard: [] };
    if (editMode) {
      const rows = steps(session).reduce<{ text: string; callback_data: string }[][]>((acc, step, index) => {
        const rowIndex = Math.floor(index / 2);
        acc[rowIndex] ??= [];
        acc[rowIndex]!.push({ text: `${index + 1}. ${step.label}`, callback_data: `app:field:${step.field}` });
        return acc;
      }, []);
      rows.push([{ text: c.done, callback_data: "app:done" }]);
      return { inline_keyboard: rows };
    }
    return {
      inline_keyboard: [[
        { text: c.edit, callback_data: "app:edit" },
        { text: c.submit, callback_data: "app:submit" },
      ]],
    };
  };
  const renderApplication = (session: ApplicationSession, editMode = false): string => {
    const c = copy(session);
    const localizedSteps = steps(session);
    const required = APPLICATION_FIELDS.filter((step) => !step.optional).length;
    const done = APPLICATION_FIELDS.filter((step) => !step.optional && hasField(session, step.field)).length;
    const lines = [
      "<b>SEVER Crew</b>",
      session.submitted ? c.sentStatus : `${c.appStatus} · ${done}/${required}`,
      "",
      ...localizedSteps.map((step, index) => {
        const answered = step.optional ? session.draft[step.field] !== undefined : hasField(session, step.field);
        const mark = answered ? "✓" : "○";
        return `${mark} ${index + 1}. ${step.label}: ${escapeHtml(displayValue(session, step.field))}`;
      }),
    ];
    if (session.lastError) lines.push("", `⚠️ ${escapeHtml(session.lastError)}`);
    if (editMode) {
      lines.push("", c.editPrompt);
    }
    return lines.join("\n");
  };
  const renderQuestion = (session: ApplicationSession): string | null => {
    const c = copy(session);
    if (session.submitted) return null;
    const field = session.editingField ?? firstUnansweredField(session) ?? firstRequiredMissingField(session);
    if (!field) return c.completeQuestion;
    const localizedSteps = steps(session);
    const index = localizedSteps.findIndex((step) => step.field === field);
    const step = localizedSteps[index];
    if (!step) return null;
    const lines = [`<b>${index + 1}. ${escapeHtml(step.label)}</b>`, escapeHtml(step.question)];
    if (!session.usedSingleAnswers && field === "firstName") {
      lines.push("", ...c.listHint);
    }
    return lines.join("\n");
  };
  const renderOrSendApplication = async (chatId: string, session: ApplicationSession, editMode = false) => {
    const text = renderApplication(session, editMode);
    const markup = keyboard(session, editMode);
    if (session.summaryMessageId) {
      const edited = await edit(chatId, session.summaryMessageId, text, markup);
      if (edited?.ok || edited?.description?.includes("message is not modified")) return;
      if (!edited?.description?.includes("message to edit not found")) return;
    }
    const sent = await send(chatId, text, markup);
    const messageId = (sent?.result as { message_id?: number } | undefined)?.message_id;
    if (typeof messageId === "number") session.summaryMessageId = messageId;
  };
  const replaceQuestion = async (chatId: string, session: ApplicationSession) => {
    if (session.questionMessageId) {
      await del(chatId, session.questionMessageId);
      session.questionMessageId = null;
    }
    const text = renderQuestion(session);
    if (!text) return;
    const sent = await send(chatId, text);
    const messageId = (sent?.result as { message_id?: number } | undefined)?.message_id;
    if (typeof messageId === "number") session.questionMessageId = messageId;
  };
  const startApplication = async (chatId: string, username: string | null) => {
    const previous = sessions.get(chatId);
    if (previous?.summaryMessageId) await del(chatId, previous.summaryMessageId);
    if (previous?.questionMessageId) await del(chatId, previous.questionMessageId);
    const session: ApplicationSession = {
      summaryMessageId: null,
      questionMessageId: null,
      editingField: null,
      lang: null,
      draft: { telegramId: chatId, telegramUsername: username },
      username,
      lastError: null,
      usedSingleAnswers: false,
      submitted: false,
    };
    sessions.set(chatId, session);
    const sent = await send(chatId, CHOOSE_LANGUAGE_TEXT, languageKeyboard);
    const messageId = (sent?.result as { message_id?: number } | undefined)?.message_id;
    if (typeof messageId === "number") session.summaryMessageId = messageId;
  };
  const submitApplication = async (chatId: string, session: ApplicationSession) => {
    const c = copy(session);
    const missing = firstRequiredMissingField(session);
    if (missing) {
      session.lastError = c.required(c.fieldLabels[missing]);
      await renderOrSendApplication(chatId, session);
      return false;
    }
    try {
      session.draft.language = session.lang ?? "ru";
      await people.submitApplication(session.draft as People.SubmitCrewApplicationInput);
      session.submitted = true;
      session.lastError = null;
      session.editingField = null;
      if (session.questionMessageId) await del(chatId, session.questionMessageId);
      await renderOrSendApplication(chatId, session);
      sessions.delete(chatId);
      await send(chatId, c.submitted);
    } catch (err) {
      session.lastError = submitError(session, err);
      await renderOrSendApplication(chatId, session);
    }
    return true;
  };
  const isWorkAccount = async (username: string | null | undefined): Promise<boolean> => {
    const settings = await people.getTelegramInboxSettings();
    return !!settings.workUsername && normHandle(username) === normHandle(settings.workUsername);
  };
  const canUseInbox = async (chatId: string, username: string | null | undefined): Promise<boolean> => {
    if (!await isWorkAccount(username)) return false;
    const user = (await people.list("all")).find((item) => item.active && item.telegramId === chatId);
    return !!user && (await people.permissionsForUser(user.id)).includes("telegram.inbox.manage");
  };
  const INBOX_PAGE_SIZE = 10;
  const telegramDisplayName = (from: NonNullable<Update["message"]>["from"]): string | null =>
    [from?.first_name, from?.last_name].filter(Boolean).join(" ").trim() || null;
  const participantLabel = (p: People.TelegramDialogParticipantDTO): string =>
    p.displayName?.trim() || (p.telegramUsername ? `@${p.telegramUsername.replace(/^@/, "")}` : p.telegramDisplayName?.trim() || "Без имени");
  const operatorReplyKeyboard = {
    keyboard: [["☰ Диалоги", "↩ Выйти"]],
    resize_keyboard: true,
    one_time_keyboard: false,
  };
  const rememberOperatorMessage = (operatorChatId: string, sent: Awaited<ReturnType<typeof send>>) => {
    const messageId = (sent?.result as { message_id?: number } | undefined)?.message_id;
    if (typeof messageId !== "number") return;
    const session = operatorSessions.get(operatorChatId) ?? { targetTelegramId: null, menuMessageIds: [] };
    session.menuMessageIds.push(messageId);
    operatorSessions.set(operatorChatId, session);
  };
  const clearOperatorMessages = async (operatorChatId: string) => {
    const session = operatorSessions.get(operatorChatId);
    if (!session?.menuMessageIds.length) return;
    for (const messageId of session.menuMessageIds) await tg("deleteMessage", { chat_id: operatorChatId, message_id: messageId });
    session.menuMessageIds = [];
    operatorSessions.set(operatorChatId, session);
  };
  const operatorMenu = async (operatorChatId: string, page = 0) => {
    await clearOperatorMessages(operatorChatId);
    const participants = await people.listTelegramDialogParticipants();
    const pageCount = Math.max(1, Math.ceil(participants.length / INBOX_PAGE_SIZE));
    const safePage = Math.min(Math.max(0, page), pageCount - 1);
    const pageItems = participants.slice(safePage * INBOX_PAGE_SIZE, (safePage + 1) * INBOX_PAGE_SIZE);
    const rows = pageItems.reduce<{ text: string; callback_data: string }[][]>((acc, p, index) => {
      const rowIndex = Math.floor(index / 2);
      acc[rowIndex] ??= [];
      acc[rowIndex]!.push({ text: participantLabel(p).slice(0, 28), callback_data: `inbox:open:${p.telegramId}` });
      return acc;
    }, []);
    if (pageCount > 1) {
      const nav: { text: string; callback_data: string }[] = [];
      if (safePage > 0) nav.push({ text: "‹", callback_data: `inbox:page:${safePage - 1}` });
      nav.push({ text: `${safePage + 1}/${pageCount}`, callback_data: `inbox:page:${safePage}` });
      if (safePage < pageCount - 1) nav.push({ text: "›", callback_data: `inbox:page:${safePage + 1}` });
      rows.push(nav);
    }
    rows.push([{ text: "↩ Выйти", callback_data: "inbox:exit" }]);
    rememberOperatorMessage(operatorChatId, await send(operatorChatId, "Inbox", operatorReplyKeyboard, { log: false }));
    const sent = await send(
      operatorChatId,
      `<b>SEVER Inbox</b>\nДиалоги: ${participants.length}`,
      { inline_keyboard: rows },
      { log: false }
    );
    rememberOperatorMessage(operatorChatId, sent);
  };
  const renderDialogLine = (m: People.TelegramDialogMessageDTO, dateTimeSettings: AppSettings.DateTimeSettingsDTO): string => {
    const label = m.direction === "user" ? "👤" : m.direction === "operator" ? "SEVER" : "🤖";
    const type = m.messageType === "photo" ? " [photo]" : "";
    const text = escapeHtml(stripHtml(m.text) || type.trim() || "—");
    const body = m.deletedAt ? `<s>${text}</s>` : text;
    return `${formatDateTimeValue(m.createdAt, dateTimeSettings, "ru-RU")} ${label} ${body}`;
  };
  const sendDialogHistory = async (operatorChatId: string, targetTelegramId: string) => {
    await clearOperatorMessages(operatorChatId);
    const [participants, messages, dateTimeSettings] = await Promise.all([
      people.listTelegramDialogParticipants(),
      people.listTelegramDialogMessages(targetTelegramId, 80),
      deps.appSettings.getDateTimeSettings(),
    ]);
    const participant = participants.find((p) => p.telegramId === targetTelegramId);
    const title = participant ? participantLabel(participant) : "Без имени";
    const chunks: string[] = [];
    let current = `<b>Диалог: ${escapeHtml(title)}</b>\n\n`;
    for (const message of messages) {
      const line = `${renderDialogLine(message, dateTimeSettings)}\n`;
      if (current.length + line.length > 3600) {
        chunks.push(current);
        current = "";
      }
      current += line;
    }
    chunks.push(current.trim() || `<b>Диалог: ${escapeHtml(title)}</b>\nПока пусто.`);
    operatorSessions.set(operatorChatId, { targetTelegramId, menuMessageIds: [] });
    for (const chunk of chunks) {
      rememberOperatorMessage(operatorChatId, await send(operatorChatId, chunk, undefined, { log: false }));
    }
    rememberOperatorMessage(operatorChatId, await send(
      operatorChatId,
      `Режим ответа: <b>${escapeHtml(title)}</b>\nВаши сообщения уйдут человеку от лица SEVER.`,
      operatorReplyKeyboard,
      { log: false }
    ));
  };
  const notifyWorkAccount = async (fromChatId: string, username: string | null | undefined, displayName: string | null, text: string, type: People.TelegramMessageType) => {
    const workChatId = await people.getTelegramInboxWorkChatId();
    if (!workChatId || workChatId === fromChatId) return;
    const users = await people.list("all");
    const user = users.find((item) => item.telegramId === fromChatId);
    const name = user ? publicName(user) : username ? `@${username}` : displayName || "Без имени";
    const body = [
      `<b>Новое сообщение в бот</b>`,
      escapeHtml(name),
      "",
      type === "photo" ? "[photo]" : escapeHtml(text).slice(0, 1200),
    ].join("\n");
    await send(workChatId, body, {
      inline_keyboard: [[{ text: "Открыть диалог", callback_data: `inbox:open:${fromChatId}` }]],
    }, { log: false });
  };
  const logIncomingMessage = async (chatId: string, msg: NonNullable<Update["message"]>) => {
    const photo = [...(msg.photo ?? [])].sort((a, b) => (b.file_size ?? 0) - (a.file_size ?? 0))[0];
    const text = msg.text?.trim() ?? (photo ? "[photo]" : "");
    const type: People.TelegramMessageType = photo ? "photo" : "text";
    const displayName = telegramDisplayName(msg.from);
    await people.logTelegramDialogMessage({
      telegramId: chatId,
      telegramUsername: msg.from?.username ? `@${msg.from.username}` : null,
      telegramDisplayName: displayName,
      direction: "user",
      messageType: type,
      text,
      telegramMessageId: msg.message_id,
    });
    return { text, type, displayName };
  };

  const financeCategoryLabels: Partial<Record<Finance.TxCategory, string>> = {
    purchase: "Закупка",
    repair: "Ремонт",
    other: "Прочее",
  };
  // Financial drafts and confirmations are intentionally excluded from the
  // shared Telegram inbox journal: access to that inbox is a different right.
  const sendFinance = (chatId: string, text: string, replyMarkup?: unknown) =>
    sendControl(chatId, text, replyMarkup);
  const financeUser = async (chatId: string) => {
    if (!finance || !/^\d+$/.test(chatId)) return null;
    const user = (await people.list("all")).find((item) => item.active && item.telegramId === chatId);
    if (!user) return null;
    const permissions = await people.permissionsForUser(user.id);
    return permissions.includes("telegram.finance.transactions") ? user : null;
  };
  const activeFinanceSession = async (chatId: string): Promise<FinanceSession | null> => {
    const session = financeSessions.get(chatId);
    if (!session) return null;
    const user = await financeUser(chatId);
    if (!user || user.id !== session.userId || session.expiresAt < Date.now()) {
      financeSessions.delete(chatId);
      return null;
    }
    session.expiresAt = Date.now() + 15 * 60_000;
    return session;
  };
  const cancelFinanceSession = async (chatId: string) => {
    financeSessions.delete(chatId);
    await projectPanelMenu(chatId);
  };
  const startFinanceSession = async (chatId: string, projectId: string | null = null, preset?: { kind: Finance.TxKind; category: Finance.TxCategory; assignmentId?: string | null; contractorId?: string | null }) => {
    const user = await financeUser(chatId);
    if (!user || !finance) {
      await sendFinance(chatId, "Команда недоступна.");
      return;
    }
    const accounts = await finance.listAccounts();
    if (!accounts.length) {
      await sendFinance(chatId, "Нет доступных счетов. Сначала создайте счёт в приложении.");
      return;
    }
    financeSessions.set(chatId, {
      userId: user.id,
      requestKey: crypto.randomUUID(),
      mode: "transaction",
      stage: "account",
      accountId: null,
      kind: preset?.kind ?? null,
      category: preset?.category ?? null,
      amount: null,
      expression: null,
      note: null,
      projectId,
      assignmentId: preset?.assignmentId ?? null,
      contractorId: preset?.contractorId ?? null,
      expiresAt: Date.now() + 15 * 60_000,
    });
    await sendFinance(chatId, `${projectId ? "<b>Транзакция по проекту</b>" : "<b>Новая транзакция</b>"}\nВыберите счёт:`, {
      inline_keyboard: [
        ...accounts.map((account) => [{ text: `${account.name} · ${account.currency}`.slice(0, 60), callback_data: `tx:account:${account.id}` }]),
        [{ text: "Отмена", callback_data: "tx:cancel" }],
      ],
    });
  };
  const startAccountAdjustmentSession = async (chatId: string) => {
    const user = await financeUser(chatId);
    if (!user || !finance) { await sendFinance(chatId, "Команда недоступна."); return; }
    const permissions = await people.permissionsForUser(user.id);
    if (!permissions.includes("finance.account.adjust")) { await sendFinance(chatId, "Недостаточно прав для сверки счёта."); return; }
    const accounts = await finance.listAccounts();
    if (!accounts.length) { await sendFinance(chatId, "Нет доступных счетов. Сначала создайте счёт в приложении."); return; }
    financeSessions.set(chatId, {
      userId: user.id, requestKey: crypto.randomUUID(), mode: "account_adjustment", stage: "account", accountId: null,
      kind: null, category: null, amount: null, expression: null, note: null,
      projectId: null, assignmentId: null, contractorId: null, expiresAt: Date.now() + 15 * 60_000,
    });
    await sendFinance(chatId, "<b>Сверка остатка</b>\nВыберите счёт:", { inline_keyboard: [
      ...accounts.map((account) => [{ text: `${account.name} · ${account.currency} · сейчас ${account.balance.toFixed(2)}`.slice(0, 60), callback_data: `tx:account:${account.id}` }]),
      [{ text: "Отмена", callback_data: "tx:cancel" }],
    ] });
  };
  const sendFinanceConfirmation = async (chatId: string, session: FinanceSession) => {
    if (!finance || !session.accountId || session.amount == null || (session.mode === "transaction" && (!session.kind || !session.category))) return;
    const account = (await finance.listAccounts()).find((item) => item.id === session.accountId);
    if (!account) {
      financeSessions.delete(chatId);
      await sendFinance(chatId, "Выбранный счёт больше недоступен. Начните заново: /transaction");
      return;
    }
    if (session.mode === "account_adjustment") {
      await sendFinance(chatId, [
        "<b>Проверьте сверку</b>",
        `Счёт: ${escapeHtml(account.name)} · ${account.currency}`,
        `Текущий остаток: <b>${account.balance.toFixed(2)} ${account.currency}</b>`,
        `Фактический остаток: <b>${session.amount.toFixed(2)} ${account.currency}</b>`,
        `Комментарий: ${escapeHtml(session.note || "—")}`,
      ].join("\n"), { inline_keyboard: [[{ text: "✅ Провести сверку", callback_data: "tx:confirm" }, { text: "Отмена", callback_data: "tx:cancel" }]] });
      return;
    }
    if (!session.kind || !session.category) return;
    const direction = session.kind === "income" ? "Доход" : "Расход";
    const category = financeCategoryLabels[session.category] ?? "Прочее";
    await sendFinance(chatId, [
      "<b>Проверьте транзакцию</b>",
      `Счёт: ${escapeHtml(account.name)} · ${account.currency}`,
      `Тип: ${direction}`,
      `Категория: ${category}`,
      session.projectId ? "Проект: выбран в панели" : null,
      `Сумма: <b>${session.amount.toFixed(2)} ${account.currency}</b>`,
      session.expression && session.expression !== String(session.amount) ? `Расчёт: <code>${escapeHtml(session.expression)}</code>` : null,
      `Комментарий: ${escapeHtml(session.note || "—")}`,
    ].filter(Boolean).join("\n"), {
      inline_keyboard: [[
        { text: "✅ Провести", callback_data: "tx:confirm" },
        { text: "Отмена", callback_data: "tx:cancel" },
      ]],
    });
  };
  const handleFinanceMessage = async (chatId: string, msg: NonNullable<Update["message"]>): Promise<boolean> => {
    const text = msg.text?.trim() ?? "";
    if (/^\/(?:transaction|tx)(?:@[A-Za-z0-9_]+)?$/.test(text)) {
      if ((msg.chat.type && msg.chat.type !== "private") || (msg.from?.id != null && String(msg.from.id) !== chatId)) {
        await sendFinance(chatId, "Финансовые операции доступны только в личном чате с ботом.");
        return true;
      }
      await startFinanceSession(chatId);
      return true;
    }
    const existing = financeSessions.get(chatId);
    if (!existing) return false;
    if (text === "/cancel") {
      await cancelFinanceSession(chatId);
      return true;
    }
    const session = await activeFinanceSession(chatId);
    if (!session) {
      await sendFinance(chatId, "Сессия завершена или право отозвано. Команда: /transaction");
      return true;
    }
    if (session.stage === "amount") {
      try {
        session.amount = evaluateTelegramAmount(text);
        session.expression = text;
        session.stage = "note";
        await sendFinance(chatId, `${session.mode === "account_adjustment" ? "Фактический остаток" : "Сумма"}: <b>${session.amount.toFixed(2)}</b>\nТеперь отправьте комментарий или <code>-</code>, чтобы оставить его пустым.`);
      } catch (error) {
        await sendFinance(chatId, `${escapeHtml(error instanceof Error ? error.message : "Не удалось посчитать сумму")}\nПример: <code>1200 + 3*450</code>`);
      }
      return true;
    }
    if (session.stage === "note") {
      if (text.length > 500) {
        await sendFinance(chatId, "Комментарий слишком длинный. Максимум 500 символов.");
        return true;
      }
      session.note = text === "-" ? null : text;
      session.stage = "confirm";
      await sendFinanceConfirmation(chatId, session);
      return true;
    }
    await sendFinance(chatId, "Выберите вариант кнопкой выше или отмените операцию: /cancel");
    return true;
  };
  const handleFinanceCallback = async (data: string, chatId: string): Promise<boolean> => {
    if (!data.startsWith("tx:")) return false;
    if (data === "tx:cancel") {
      await cancelFinanceSession(chatId);
      return true;
    }
    const session = await activeFinanceSession(chatId);
    if (!session || !finance) {
      await sendFinance(chatId, "Сессия завершена или право отозвано. Команда: /transaction");
      return true;
    }
    const accountMatch = data.match(/^tx:account:([0-9a-f-]{36})$/i);
    if (accountMatch && session.stage === "account") {
      const account = (await finance.listAccounts()).find((item) => item.id === accountMatch[1]);
      if (!account) {
        await sendFinance(chatId, "Счёт не найден. Начните заново: /transaction");
        financeSessions.delete(chatId);
        return true;
      }
      session.accountId = account.id;
      if (session.mode === "account_adjustment") {
        session.stage = "amount";
        await sendFinance(chatId, `Счёт: <b>${escapeHtml(account.name)}</b> · ${account.currency}\nВведите фактический остаток на счёте.`);
        return true;
      }
      if (session.kind && session.category) {
        session.stage = "amount";
        await sendFinance(chatId, `Счёт: <b>${escapeHtml(account.name)}</b> · ${account.currency}\nВведите сумму или выражение. Например: <code>1200 + 3*450</code>`);
        return true;
      }
      session.stage = "kind";
      await sendFinance(chatId, `Счёт: <b>${escapeHtml(account.name)}</b> · ${account.currency}\nВыберите тип операции:`, {
        inline_keyboard: [[
          { text: "＋ Доход", callback_data: "tx:kind:income" },
          { text: "− Расход", callback_data: "tx:kind:expense" },
        ], [{ text: "Отмена", callback_data: "tx:cancel" }]],
      });
      return true;
    }
    const kindMatch = data.match(/^tx:kind:(income|expense)$/);
    if (kindMatch && session.stage === "kind") {
      session.kind = kindMatch[1] as Finance.TxKind;
      if (session.kind === "income") {
        session.category = "other";
        session.stage = "amount";
        await sendFinance(chatId, "Введите сумму или выражение. Например: <code>1200 + 3*450</code>");
      } else {
        session.stage = "category";
        await sendFinance(chatId, "Выберите категорию расхода:", {
          inline_keyboard: [[
            { text: "Закупка", callback_data: "tx:category:purchase" },
            { text: "Ремонт", callback_data: "tx:category:repair" },
          ], [{ text: "Прочее", callback_data: "tx:category:other" }], [{ text: "Отмена", callback_data: "tx:cancel" }]],
        });
      }
      return true;
    }
    const categoryMatch = data.match(/^tx:category:(purchase|repair|other)$/);
    if (categoryMatch && session.stage === "category" && session.kind === "expense") {
      session.category = categoryMatch[1] as Finance.TxCategory;
      session.stage = "amount";
      await sendFinance(chatId, "Введите сумму или выражение. Например: <code>1200 + 3*450</code>");
      return true;
    }
    if (data === "tx:confirm" && session.stage === "confirm" && session.accountId && session.amount != null && (session.mode === "account_adjustment" || (session.kind && session.category))) {
      const account = (await finance.listAccounts()).find((item) => item.id === session.accountId);
      if (!account) {
        financeSessions.delete(chatId);
        await sendFinance(chatId, "Счёт больше недоступен. Транзакция не проведена.");
        return true;
      }
      const authorized = await financeUser(chatId);
      if (!authorized || authorized.id !== session.userId) {
        financeSessions.delete(chatId);
        await sendFinance(chatId, "Право на операции через Telegram отозвано. Транзакция не проведена.");
        return true;
      }
      try {
        if (session.mode === "account_adjustment") {
          const permissions = await people.permissionsForUser(session.userId);
          if (!permissions.includes("finance.account.adjust")) throw new Error("Недостаточно прав для сверки счёта.");
          const adjusted = await finance.adjustAccountBalance({ requestKey: session.requestKey, accountId: account.id, targetBalance: session.amount, note: session.note, createdByUserId: session.userId });
          financeSessions.delete(chatId);
          await sendFinance(chatId, `✅ Сверка проведена: <b>${adjusted.amount.toFixed(2)} ${adjusted.currency}</b>`, { inline_keyboard: [[{ text: "☰ Меню", callback_data: "nav:menu" }]] });
          return true;
        }
        if (!session.kind || !session.category) return true;
        const created = await finance.createTransaction({
          requestKey: session.requestKey,
          accountId: account.id,
          kind: session.kind,
          category: session.category,
          amount: session.amount,
          currency: account.currency,
          projectId: session.projectId,
          assignmentId: session.assignmentId,
          contractorId: session.contractorId,
          note: session.note,
          createdByUserId: session.userId,
        });
        financeSessions.delete(chatId);
        await sendFinance(chatId, `✅ Проведено: <b>${created.amount.toFixed(2)} ${created.currency}</b>\nID: <code>${created.id}</code>`, { inline_keyboard: [[{ text: "☰ Меню", callback_data: "nav:menu" }]] });
      } catch {
        await sendFinance(chatId, "Не удалось провести транзакцию. Данные не изменены; попробуйте подтвердить ещё раз или отмените операцию.");
      }
      return true;
    }
    await sendFinance(chatId, "Этот шаг уже неактуален. Используйте последнюю кнопку или /cancel.");
    return true;
  };

  // ── Project control panel ────────────────────────────────────────────────
  // This layer deliberately only navigates and invokes existing module
  // services. It does not introduce a Telegram-specific project model.
  const linkedUser = async (chatId: string) =>
    (await people.list("all")).find((item) => item.active && item.telegramId === chatId) ?? null;
  const canSeeAllProjects = (permissions: readonly string[]) =>
    permissions.includes("projects.manage") || permissions.includes("projects.reservation.manage");
  const visibleProjects = async (userId: string, permissions: readonly string[]) => {
    if (!projects) return [];
    return canSeeAllProjects(permissions) ? projects.listProjects() : projects.listProjectsForUser(userId);
  };
  const projectDate = (value: string | null) => value ? value.slice(0, 10).split("-").reverse().join(".") : "без даты";
  const statusLabel = (status: Projects.ProjectStatus) => ({
    draft: "Черновик", confirmed: "Подтверждён", in_progress: "В работе",
    awaiting_payment: "Ждёт оплаты", completed: "Завершён", cancelled: "Отменён",
  }[status]);
  // Telegram does not support custom text colours on inline buttons; these
  // muted circle markers render consistently in its native clients.
  const statusMarker = (status: Projects.ProjectStatus) => ({
    draft: "⚪", confirmed: "🔵", in_progress: "🟡", awaiting_payment: "🟣", completed: "🟢", cancelled: "🔴",
  }[status]);
  const projectPanelMenu = async (chatId: string, telegramUsername?: string | null) => {
    // Entering the root discards every ephemeral flow, including stale callback
    // state left behind after an interrupted action.
    financeSessions.delete(chatId);
    projectSessions.delete(chatId);
    equipmentSessions.delete(chatId);
    const user = await linkedUser(chatId);
    if (!user || !projects) {
      await send(chatId, "Панель доступна после привязки Telegram к активному аккаунту.", undefined, { log: false });
      return;
    }
    const permissions = await people.permissionsForUser(user.id);
    const keyboard: string[][] = [["📁 Найти проект"]];
    if (permissions.includes("warehouse.view") || permissions.includes("warehouse.catalog.manage")) keyboard.push(["📦 Найти оборудование"]);
    if (permissions.includes("telegram.finance.transactions")) keyboard.push(["💳 Финансы"]);
    if (await canUseInbox(chatId, telegramUsername ?? user.telegramUsername)) keyboard.push(["💬 Диалоги"]);
    await sendControl(chatId, "<b>SEVER · быстрые действия</b>\nВыберите раздел.", { keyboard, resize_keyboard: true, one_time_keyboard: false, is_persistent: true });
  };
  const showFinanceMenu = async (chatId: string) => {
    const user = await financeUser(chatId);
    if (!user) { await sendControl(chatId, "Раздел финансов недоступен."); return; }
    financeSessions.delete(chatId);
    const permissions = await people.permissionsForUser(user.id);
    const rows: { text: string; callback_data: string }[][] = [[{ text: "💳 Новая транзакция", callback_data: "nav:transaction" }]];
    if (permissions.includes("finance.account.adjust")) rows.push([{ text: "⚖️ Сверка остатка счёта", callback_data: "nav:account-adjustment" }]);
    rows.push([{ text: "☰ Меню", callback_data: "nav:menu" }]);
    await sendControl(chatId, "<b>Финансы</b>\nВыберите действие.", { inline_keyboard: rows });
  };
  const startProjectSearch = async (chatId: string) => {
    const user = await linkedUser(chatId);
    if (!user || !projects) return;
    projectSessions.set(chatId, { userId: user.id, awaitingSearch: true, selectedProjectId: null, expiresAt: Date.now() + 15 * 60_000 });
    await sendControl(chatId, "<b>Поиск проекта</b>\nНапишите название, клиента, статус или дату. Например: <code>acme</code> или <code>10.11</code>.\n\n/cancel — отмена", { inline_keyboard: [[{ text: "☰ Меню", callback_data: "nav:menu" }]] });
  };
  const renderProjectCard = async (chatId: string, projectId: string, userId: string, permissions: readonly string[]) => {
    if (!projects) return;
    const project = (await visibleProjects(userId, permissions)).find((item) => item.id === projectId);
    if (!project) {
      projectSessions.delete(chatId);
      await send(chatId, "Проект больше недоступен. Начните поиск заново.", undefined, { log: false });
      return;
    }
    const clients = await projects.listClients();
    const client = clients.find((item) => item.id === project.clientId);
    const rows: { text: string; callback_data: string }[][] = [];
    if (permissions.includes("projects.reservation.manage")) rows.push([{ text: "📦 Бронирования", callback_data: `nav:project:reservations:${project.id}` }]);
    if (permissions.includes("apex.view")) rows.push([{ text: "⚠️ Проблемы", callback_data: `nav:project:problems:${project.id}` }]);
    if (permissions.includes("telegram.finance.transactions")) rows.push([{ text: "💳 Финансы проекта", callback_data: `nav:project:finance:${project.id}` }]);
    if (permissions.includes("operations.contractor_turnover.view") || permissions.includes("operations.contractor_turnover.manage") || permissions.includes("projects.reservation.manage")) {
      rows.push([{ text: "🤝 Подрядчики", callback_data: `nav:project:contractors:${project.id}` }]);
    }
    if (permissions.includes("projects.manage")) rows.push([{ text: "📝 Изменить статус", callback_data: `nav:project:statuses:${project.id}` }]);
    rows.push([{ text: "🔎 Другой проект", callback_data: "nav:projects" }, { text: "☰ Меню", callback_data: "nav:menu" }]);
    projectSessions.set(chatId, { userId, awaitingSearch: false, selectedProjectId: project.id, expiresAt: Date.now() + 15 * 60_000 });
    await sendControl(chatId, [
      `<b>${escapeHtml(project.name)}</b>`,
      `${statusMarker(project.status)} ${projectDate(project.startsAt)} — ${projectDate(project.endsAt)} · ${statusLabel(project.status)}`,
      `Клиент: ${escapeHtml(client?.name ?? "—")}`,
      `Режим: ${project.serviceMode === "full_service" ? "полный сервис" : "сухая аренда"}`,
    ].join("\n"), { inline_keyboard: rows });
  };
  const isVisibleProject = async (projectId: string, userId: string, permissions: readonly string[]) =>
    (await visibleProjects(userId, permissions)).some(project => project.id === projectId);
  const modelLabel = (model: Equipment.EquipmentModelDTO | null | undefined) => model?.name ?? "Оборудование";
  const renderReservations = async (chatId: string, projectId: string, userId: string, permissions: readonly string[]) => {
    if (!projects || !equipment || !permissions.includes("projects.reservation.manage") || !await isVisibleProject(projectId, userId, permissions)) {
      await sendControl(chatId, "Действие недоступно."); return;
    }
    const [project, reservations] = await Promise.all([projects.getProject(projectId), projects.listReservations(projectId)]);
    if (!project) { await sendControl(chatId, "Проект больше недоступен."); return; }
    const models = new Map((await equipment.listModels()).map(model => [model.id, model]));
    const text = [
      `<b>Брони · ${escapeHtml(project.baseName)}</b>`,
      reservations.length ? "Выберите позицию для изменения:" : "Броней пока нет.",
      ...await Promise.all(reservations.map(async reservation => {
        const availability = reservation.startsAt && reservation.endsAt
          ? await projects.reservationAvailability(reservation.modelId, reservation.startsAt, reservation.endsAt) : null;
        return `• ${escapeHtml(modelLabel(models.get(reservation.modelId)))} — ${reservation.qty} шт. · распределено ${reservation.resolvedUnitIds.length}/${reservation.qty}${reservation.isReserve ? " · резерв" : ""}${availability ? ` · свободно ${availability.free}` : ""}`;
      })),
    ].join("\n");
    reservationSessions.set(chatId, { userId, projectId, awaitingModelSearch: false, selectedReservationId: null, selectedUnitIds: [], expiresAt: Date.now() + 15 * 60_000 });
    await sendControl(chatId, text, { inline_keyboard: [
      ...reservations.map(reservation => [{ text: `${modelLabel(models.get(reservation.modelId))} · ${reservation.qty}`.slice(0, 60), callback_data: `nav:reservation:open:${reservation.id}` }]),
      [{ text: "＋ Добавить модель", callback_data: "nav:reservation:add" }],
      [{ text: "↩ К проекту", callback_data: `nav:project:open:${projectId}` }],
    ] });
  };
  const renderReservation = async (chatId: string, reservationId: string, userId: string, permissions: readonly string[]) => {
    if (!projects || !equipment || !permissions.includes("projects.reservation.manage")) { await sendControl(chatId, "Действие недоступно."); return; }
    const session = reservationSessions.get(chatId);
    const reservations = session ? await projects.listReservations(session.projectId) : [];
    const reservation = reservations.find(item => item.id === reservationId);
    if (!session || session.userId !== userId || session.expiresAt < Date.now() || !reservation) { await sendControl(chatId, "Эта бронь уже изменилась. Откройте список заново."); return; }
    const [model, availability] = await Promise.all([
      equipment.getModel(reservation.modelId),
      reservation.startsAt && reservation.endsAt ? projects.reservationAvailability(reservation.modelId, reservation.startsAt, reservation.endsAt) : Promise.resolve(null),
    ]);
    session.selectedReservationId = reservation.id; session.selectedUnitIds = reservation.resolvedUnitIds; session.expiresAt = Date.now() + 15 * 60_000;
    await sendControl(chatId, [
      `<b>${escapeHtml(modelLabel(model))}</b>`,
      `Количество: <b>${reservation.qty}</b>${reservation.isReserve ? " · резерв" : ""}`,
      `Серийные единицы: ${reservation.resolvedUnitIds.length}/${reservation.qty}`,
      availability ? `Доступность на период: всего ${availability.total}, занято до ${availability.booked}, свободно ${availability.free}${availability.shortage ? `, не хватает ${availability.shortage}` : ""}` : "Для проверки доступности укажите период проекта.",
    ].join("\n"), { inline_keyboard: [
      [{ text: "−1", callback_data: `nav:reservation:qty:${reservation.id}:-1` }, { text: "+1", callback_data: `nav:reservation:qty:${reservation.id}:1` }],
      ...(model?.trackingMode === "serial" && (model.effectiveReservationAssignmentMode ?? "planning") === "planning" ? [[{ text: "🔢 Распределить единицы", callback_data: `nav:reservation:units:${reservation.id}` }]] : []),
      [{ text: "↩ К броням", callback_data: `nav:project:reservations:${session.projectId}` }],
    ] });
  };
  const renderReservationUnits = async (chatId: string, reservationId: string, userId: string, permissions: readonly string[]) => {
    if (!projects || !equipment || !permissions.includes("projects.reservation.manage")) { await sendControl(chatId, "Действие недоступно."); return; }
    const session = reservationSessions.get(chatId);
    const reservation = session && (await projects.listReservations(session.projectId)).find(item => item.id === reservationId);
    if (!session || session.userId !== userId || !reservation || session.expiresAt < Date.now()) { await sendControl(chatId, "Выбор устарел. Откройте бронь заново."); return; }
    const units = (await equipment.listUnits({ modelId: reservation.modelId })).filter(unit => !["in_repair", "at_contractor", "lost"].includes(unit.status)).slice(0, 24);
    session.selectedReservationId = reservation.id;
    session.selectedUnitIds = session.selectedUnitIds.filter(id => units.some(unit => unit.id === id));
    const chosen = new Set(session.selectedUnitIds);
    await sendControl(chatId, `<b>Распределение</b>\nВыбрано ${chosen.size}/${reservation.qty}. Список уже исключает ремонт, подряд и утраченные единицы; окончательная проверка пересечений выполняется сервером.`, { inline_keyboard: [
      ...units.map(unit => [{ text: `${chosen.has(unit.id) ? "✓ " : ""}${unit.assetTag}${unit.serial ? ` · ${unit.serial}` : ""}`.slice(0, 60), callback_data: `nav:reservation:unit:${unit.id}` }]),
      [{ text: "✅ Сохранить", callback_data: "nav:reservation:units:save" }],
      [{ text: "↩ К брони", callback_data: `nav:reservation:open:${reservation.id}` }],
    ] });
  };
  const renderProjectProblems = async (chatId: string, projectId: string, userId: string, permissions: readonly string[]) => {
    if (!projects || !equipment || !permissions.includes("apex.view") || !await isVisibleProject(projectId, userId, permissions)) { await sendControl(chatId, "Действие недоступно."); return; }
    const [project, roles, assignments, reservations, problemRows] = await Promise.all([
      projects.getProject(projectId), projects.listProjectRoles(projectId), projects.listAssignments(projectId), projects.listReservations(projectId), projects.listProblems(),
    ]);
    if (!project) { await sendControl(chatId, "Проект больше недоступен."); return; }
    const models = new Map((await equipment.listModels()).map(model => [model.id, model]));
    const active = assignments.filter(item => item.status === "added" || item.status === "accepted");
    const missingRoles = roles.filter(role => active.filter(item => item.roleId === role.id).length < role.requiredCount);
    const unallocated = reservations.filter(reservation => {
      const model = models.get(reservation.modelId);
      return model?.trackingMode === "serial" && (model.effectiveReservationAssignmentMode ?? "planning") === "planning" && reservation.resolvedUnitIds.length < reservation.qty;
    });
    const conflicts = problemRows.filter(problem => !problem.resolved && problem.kind === "reservation_conflict" && problem.refs.projectId === projectId);
    problemSessions.set(chatId, { userId, projectId, selectedRoleId: null, expiresAt: Date.now() + 15 * 60_000 });
    const lines = [
      `<b>Проблемы · ${escapeHtml(project.baseName)}</b>`,
      `Прогресс: устранено ${Math.max(0, roles.length + reservations.length - missingRoles.length - unallocated.length - conflicts.length)} из ${roles.length + reservations.length || 1} проверок`,
      ...(missingRoles.length ? [`Люди: ${missingRoles.map(role => `${role.title} — ${role.requiredCount - active.filter(item => item.roleId === role.id).length}`).join(", ")}`] : []),
      ...(unallocated.length ? [`Не распределено: ${unallocated.map(reservation => `${modelLabel(models.get(reservation.modelId))} — ${reservation.qty - reservation.resolvedUnitIds.length}`).join(", ")}`] : []),
      ...conflicts.map(problem => `Пересечение: ${problem.detail}`),
      !missingRoles.length && !unallocated.length && !conflicts.length ? "✅ Доступных для исправления проблем сейчас нет." : "",
    ].filter(Boolean);
    await sendControl(chatId, lines.join("\n"), { inline_keyboard: [
      ...(permissions.includes("projects.reservation.manage") ? unallocated.map(reservation => [{ text: `Распределить · ${modelLabel(models.get(reservation.modelId))}`.slice(0, 60), callback_data: `nav:reservation:units:${reservation.id}` }]) : []),
      ...(permissions.includes("projects.assignment.manage") ? missingRoles.map(role => [{ text: `Люди · ${role.title}`.slice(0, 60), callback_data: `nav:problem:role:${role.id}` }]) : []),
      ...(conflicts.length && permissions.includes("projects.reservation.manage") ? [[{ text: "Проверить брони", callback_data: `nav:project:reservations:${projectId}` }]] : []),
      [{ text: "↻ Обновить", callback_data: `nav:project:problems:${projectId}` }, { text: "↩ К проекту", callback_data: `nav:project:open:${projectId}` }],
    ] });
  };
  const renderProblemRole = async (chatId: string, roleId: string, userId: string, permissions: readonly string[]) => {
    if (!projects || !permissions.includes("projects.assignment.manage")) { await sendControl(chatId, "Для назначения людей нужно право управления назначениями."); return; }
    const session = problemSessions.get(chatId);
    const role = session && (await projects.listProjectRoles(session.projectId)).find(item => item.id === roleId);
    if (!session || session.userId !== userId || session.expiresAt < Date.now() || !role) { await sendControl(chatId, "Эта проблема уже изменилась. Обновите список."); return; }
    const assignments = await projects.listAssignments(session.projectId);
    const activeCount = assignments.filter(item => item.roleId === role.id && (item.status === "added" || item.status === "accepted")).length;
    session.selectedRoleId = role.id; session.expiresAt = Date.now() + 15 * 60_000;
    const peopleRows = (await people.list("all")).filter(person => person.active).slice(0, 16);
    await sendControl(chatId, [
      `<b>${escapeHtml(role.title)}</b>`, `Нужно: ${role.requiredCount}; назначено: ${activeCount}; не хватает: ${Math.max(0, role.requiredCount - activeCount)}`,
      `Дресс-код: ${role.dressCodeEnabled ? "да" : "нет"}`, `Ставка: ${role.rateEUR == null ? "не задана" : `${role.rateEUR} €`}`,
      `Интервал: ${role.effectiveStartsAt ?? "—"} — ${role.effectiveEndsAt ?? "—"}`, role.comment ? `Комментарий: ${escapeHtml(role.comment)}` : "",
      "Выберите человека. Статуса «свободен/занят» в SEVER нет — показан действующий список сотрудников.",
    ].filter(Boolean).join("\n"), { inline_keyboard: [
      ...peopleRows.map(person => [{ text: (publicName(person) + (person.telegramId ? " · Telegram" : "")).slice(0, 60), callback_data: `nav:crew:person:${person.id}` }]),
      [{ text: "↩ К проблемам", callback_data: `nav:project:problems:${session.projectId}` }],
    ] });
  };
  const searchProjects = async (chatId: string, session: ProjectSession, query: string) => {
    const user = await linkedUser(chatId);
    if (!user || user.id !== session.userId || !projects) {
      projectSessions.delete(chatId);
      await send(chatId, "Сессия поиска завершена. Откройте панель заново: /menu", undefined, { log: false });
      return;
    }
    const normalized = query.trim().toLocaleLowerCase("ru-RU");
    if (normalized.length < 2) {
      await send(chatId, "Введите минимум два символа.", undefined, { log: false });
      return;
    }
    const permissions = await people.permissionsForUser(user.id);
    const [all, clients] = await Promise.all([visibleProjects(user.id, permissions), projects.listClients()]);
    const clientNames = new Map(clients.map((client) => [client.id, client.name.toLocaleLowerCase("ru-RU")]));
    const matches = all.filter((project) => [project.name, project.baseName, clientNames.get(project.clientId) ?? "", project.status, project.startsAt ?? "", project.endsAt ?? ""]
      .some((value) => value.toLocaleLowerCase("ru-RU").includes(normalized))).slice(0, 8);
    if (!matches.length) {
      await sendControl(chatId, "Ничего не найдено. Уточните запрос или используйте /cancel.");
      return;
    }
    await sendControl(chatId, `<b>Найдено: ${matches.length}</b>\nВыберите проект:`, {
      inline_keyboard: [...matches.map((project) => [{ text: `${statusMarker(project.status)} ${projectDate(project.startsAt)} · ${project.baseName} · ${statusLabel(project.status)}`.slice(0, 60), callback_data: `nav:project:open:${project.id}` }]), [{ text: "☰ Меню", callback_data: "nav:menu" }]],
    });
  };
  const selectedProject = async (chatId: string, userId: string, permissions: readonly string[]) => {
    const id = projectSessions.get(chatId)?.selectedProjectId;
    return id ? (await visibleProjects(userId, permissions)).find((project) => project.id === id) ?? null : null;
  };
  const showProjectFinance = async (chatId: string, project: Projects.ProjectDTO) => {
    await sendControl(chatId, `<b>Финансы · ${escapeHtml(project.baseName)}</b>\nЧто нужно внести?`, {
      inline_keyboard: [
        [{ text: "↙️ Оплата от клиента", callback_data: `nav:finance:client:${project.id}` }],
        [{ text: "👤 Выплата работнику", callback_data: `nav:finance:staff:${project.id}` }],
        [{ text: "🤝 Оплата подрядчику", callback_data: `nav:finance:contractor:${project.id}` }],
        [{ text: "↩ К проекту", callback_data: `nav:project:open:${project.id}` }],
      ],
    });
  };
  const showPayrollRecipients = async (chatId: string, project: Projects.ProjectDTO) => {
    if (!projects) return;
    const [assignments, users] = await Promise.all([projects.listAssignments(project.id), people.list("all")]);
    const active = assignments.filter((assignment) => assignment.status === "added" || assignment.status === "accepted");
    if (!active.length) { await sendControl(chatId, "<b>Выплата работнику</b>\nВ проекте нет активных назначений."); return; }
    const names = new Map(users.map((user) => [user.id, publicName(user)]));
    await sendControl(chatId, "<b>Выплата работнику</b>\nПлан · выплачено · осталось:", {
      inline_keyboard: active.map((assignment) => {
        const planned = assignment.rateEUR ?? 0;
        const remaining = Math.max(0, planned - assignment.paidEUR);
        const name = names.get(assignment.userId) ?? "Сотрудник";
        return [{ text: `${name}: ${planned.toFixed(2)}€ · ${assignment.paidEUR.toFixed(2)}€ · ${remaining.toFixed(2)}€`.slice(0, 60), callback_data: `nav:pay:staff:${assignment.id}` }];
      }),
    });
  };
  const showContractorRecipients = async (chatId: string, project: Projects.ProjectDTO) => {
    if (!projects || !finance) return;
    const [items, transactions] = await Promise.all([projects.listContractorItems(project.id), finance.listTransactions({ projectId: project.id })]);
    const grouped = new Map<string, number>();
    const days = projectRentalDays(project.startsAt, project.endsAt);
    for (const item of items) {
      const amount = item.costEUR * item.qty * (item.kind === "equipment" && item.pricingMode === "per_day" ? days : 1);
      grouped.set(item.contractorId, (grouped.get(item.contractorId) ?? 0) + amount);
    }
    if (!grouped.size) { await sendControl(chatId, "<b>Оплата подрядчику</b>\nВ проекте нет подрядных позиций."); return; }
    const paid = new Map<string, number>();
    for (const transaction of transactions.filter((transaction) => transaction.kind === "expense" && transaction.contractorId)) {
      paid.set(transaction.contractorId!, (paid.get(transaction.contractorId!) ?? 0) + transaction.amountEUR);
    }
    await sendControl(chatId, "<b>Оплата подрядчику</b>\nПлан · выплачено · осталось:", {
      inline_keyboard: [...grouped.entries()].map(([contractorId, planned]) => {
        const paidAmount = paid.get(contractorId) ?? 0;
        const remaining = Math.max(0, planned - paidAmount);
        return [{ text: `Подрядчик: ${planned.toFixed(2)}€ · ${paidAmount.toFixed(2)}€ · ${remaining.toFixed(2)}€`, callback_data: `nav:pay:contractor:${contractorId}` }];
      }),
    });
  };
  const MANUALLY_SETTABLE_PROJECT_STATUSES: Projects.ProjectStatus[] = ["draft", "confirmed", "in_progress", "awaiting_payment", "cancelled"];
  const showStatusPicker = async (chatId: string, project: Projects.ProjectDTO) => {
    const rows = MANUALLY_SETTABLE_PROJECT_STATUSES.map((status) => [{
      text: `${status === project.status ? "✓ " : ""}${statusMarker(status)} ${statusLabel(status)}`,
      callback_data: `nav:status:${project.id}:${status}`,
    }]);
    await sendControl(chatId, `<b>Статус · ${escapeHtml(project.baseName)}</b>\nТекущий: ${statusMarker(project.status)} ${statusLabel(project.status)}\n\nЗавершение проекта выполняется автоматически после обязательных проверок.`, { inline_keyboard: [...rows, [{ text: "↩ К проекту", callback_data: `nav:project:open:${project.id}` }]] });
  };
  const startEquipmentSearch = async (chatId: string) => {
    const user = await linkedUser(chatId);
    if (!user || !equipment) return;
    const permissions = await people.permissionsForUser(user.id);
    if (!permissions.includes("warehouse.view") && !permissions.includes("warehouse.catalog.manage")) { await sendControl(chatId, "Действие недоступно."); return; }
    equipmentSessions.set(chatId, { userId: user.id, awaitingSearch: true, selectedUnitId: null, targetWarehouseId: null, expiresAt: Date.now() + 15 * 60_000 });
    await sendControl(chatId, "<b>Поиск оборудования</b>\nНапишите название модели, производителя, маркировку, серийный номер, статус или заметку.\n\n/cancel — отмена", { inline_keyboard: [[{ text: "☰ Меню", callback_data: "nav:menu" }]] });
  };
  const renderUnitCard = async (chatId: string, unitId: string, userId: string, permissions: readonly string[]) => {
    if (!equipment) return;
    const [unit, models, warehouses] = await Promise.all([equipment.getUnit(unitId), equipment.listModels(), equipment.listWarehouses()]);
    if (!unit) { await sendControl(chatId, "Единица оборудования больше не найдена."); return; }
    const model = models.find((item) => item.id === unit.modelId);
    const warehouse = warehouses.find((item) => item.id === unit.warehouseId);
    const rows: { text: string; callback_data: string }[][] = [];
    if (permissions.includes("warehouse.catalog.manage") && unit.status === "in_stock") rows.push([{ text: "↔️ Переместить на склад", callback_data: `nav:unit:warehouses:${unit.id}` }]);
    rows.push([{ text: "📦 Другое оборудование", callback_data: "nav:equipment" }, { text: "☰ Меню", callback_data: "nav:menu" }]);
    equipmentSessions.set(chatId, { userId, awaitingSearch: false, selectedUnitId: unit.id, targetWarehouseId: null, expiresAt: Date.now() + 15 * 60_000 });
    await sendControl(chatId, [
      `<b>${escapeHtml(model?.name ?? "Оборудование")}</b>`,
      `Маркировка: <b>${escapeHtml(unit.assetTag)}</b>`,
      `Серийный номер: ${escapeHtml(unit.serial ?? "—")}`,
      `Статус: ${escapeHtml(unit.status)}`,
      `Склад: ${escapeHtml(warehouse?.name ?? "—")}`,
      unit.notes ? `Заметка: ${escapeHtml(unit.notes)}` : null,
    ].filter(Boolean).join("\n"), { inline_keyboard: rows });
  };
  const searchEquipment = async (chatId: string, session: EquipmentSession, query: string) => {
    const user = await linkedUser(chatId);
    if (!user || user.id !== session.userId || !equipment) { equipmentSessions.delete(chatId); await sendControl(chatId, "Сессия поиска завершена. Откройте меню заново."); return; }
    const normalized = query.trim().toLocaleLowerCase("ru-RU");
    if (normalized.length < 2) { await sendControl(chatId, "Введите минимум два символа."); return; }
    const permissions = await people.permissionsForUser(user.id);
    if (!permissions.includes("warehouse.view") && !permissions.includes("warehouse.catalog.manage")) { await sendControl(chatId, "Действие недоступно."); return; }
    const [units, models] = await Promise.all([equipment.listUnits(), equipment.listModels()]);
    const byModel = new Map(models.map((model) => [model.id, model]));
    const matches = units.filter((unit) => {
      const model = byModel.get(unit.modelId);
      return [unit.assetTag, unit.serial ?? "", unit.status, unit.notes ?? "", model?.name ?? "", model?.subtype ?? "", model?.manufacturer ?? ""]
        .some((value) => value.toLocaleLowerCase("ru-RU").includes(normalized));
    }).slice(0, 8);
    if (!matches.length) { await sendControl(chatId, "Ничего не найдено. Уточните запрос или используйте /cancel."); return; }
    await sendControl(chatId, `<b>Найдено: ${matches.length}</b>\nВыберите единицу:`, { inline_keyboard: [...matches.map((unit) => {
      const model = byModel.get(unit.modelId);
      return [{ text: `${unit.assetTag} · ${model?.name ?? "оборудование"} · ${unit.serial ?? unit.status}`.slice(0, 60), callback_data: `nav:unit:open:${unit.id}` }];
    }), [{ text: "☰ Меню", callback_data: "nav:menu" }]] });
  };
  const handleEquipmentMessage = async (chatId: string, msg: NonNullable<Update["message"]>): Promise<boolean> => {
    const session = equipmentSessions.get(chatId);
    if (!session) return false;
    const text = msg.text?.trim() ?? "";
    if (text === "/cancel") { await projectPanelMenu(chatId); return true; }
    if (!session.awaitingSearch || session.expiresAt < Date.now()) return false;
    await searchEquipment(chatId, session, text);
    return true;
  };
  const handleProjectMessage = async (chatId: string, msg: NonNullable<Update["message"]>): Promise<boolean> => {
    const text = msg.text?.trim() ?? "";
    if (/^\/(?:menu|panel)(?:@[A-Za-z0-9_]+)?$/.test(text) || text === "☰ Меню") {
      if ((msg.chat.type && msg.chat.type !== "private") || (msg.from?.id != null && String(msg.from.id) !== chatId)) {
        await send(chatId, "Панель доступна только в личном чате с ботом.", undefined, { log: false });
        return true;
      }
      await projectPanelMenu(chatId, msg.from?.username);
      return true;
    }
    const reservationSession = reservationSessions.get(chatId);
    if (reservationSession?.awaitingModelSearch) {
      if (text === "/cancel") { await renderReservations(chatId, reservationSession.projectId, reservationSession.userId, await people.permissionsForUser(reservationSession.userId)); return true; }
      const permissions = await people.permissionsForUser(reservationSession.userId);
      if (!equipment || reservationSession.expiresAt < Date.now() || !permissions.includes("projects.reservation.manage")) { reservationSessions.delete(chatId); await sendControl(chatId, "Поиск брони завершён."); return true; }
      const query = text.toLocaleLowerCase("ru-RU").trim();
      const models = (await equipment.listModels()).filter(model => [model.name, model.manufacturer ?? "", model.subtype ?? ""].some(value => value.toLocaleLowerCase("ru-RU").includes(query))).slice(0, 12);
      if (!models.length) { await sendControl(chatId, "Модель не найдена. Уточните запрос или используйте /cancel."); return true; }
      await sendControl(chatId, `<b>Добавить модель</b>\nНайдено: ${models.length}`, { inline_keyboard: [
        ...models.map(model => [{ text: `${model.name}${model.manufacturer ? ` · ${model.manufacturer}` : ""}`.slice(0, 60), callback_data: `nav:reservation:model:${model.id}` }]),
        [{ text: "↩ К броням", callback_data: `nav:project:reservations:${reservationSession.projectId}` }],
      ] });
      return true;
    }
    if (text === "📁 Найти проект") { await startProjectSearch(chatId); return true; }
    if (text === "📦 Найти оборудование") { await startEquipmentSearch(chatId); return true; }
    if (text === "💳 Финансы") { await showFinanceMenu(chatId); return true; }
    if (text === "💬 Диалоги") {
      if (!await canUseInbox(chatId, msg.from?.username)) { await projectPanelMenu(chatId, msg.from?.username); return true; }
      await people.rememberTelegramInboxWorkChatId(chatId);
      await operatorMenu(chatId);
      return true;
    }
    if (/^\/help(?:@[A-Za-z0-9_]+)?$/.test(text)) {
      await sendControl(chatId, "<b>SEVER Bot</b>\n☰ Меню — быстрые действия\n📁 Проекты — поиск и действия по проекту\n📦 Оборудование — поиск и перемещение между складами\n💳 Финансы — доступно только с выданным правом");
      return true;
    }
    const session = projectSessions.get(chatId);
    if (!session) return false;
    if (text === "/cancel") {
      await projectPanelMenu(chatId);
      return true;
    }
    if (session.expiresAt < Date.now() || !session.awaitingSearch) return false;
    await searchProjects(chatId, session, text);
    return true;
  };
  const handleProjectCallback = async (data: string, chatId: string, telegramUsername?: string): Promise<boolean> => {
    if (!data.startsWith("nav:")) return false;
    if (data === "nav:menu") { await projectPanelMenu(chatId, telegramUsername); return true; }
    if (data === "nav:projects") { await startProjectSearch(chatId); return true; }
    if (data === "nav:equipment") { await startEquipmentSearch(chatId); return true; }
    if (data === "nav:finance") { await showFinanceMenu(chatId); return true; }
    if (data === "nav:transaction") { await startFinanceSession(chatId); return true; }
    if (data === "nav:account-adjustment") { await startAccountAdjustmentSession(chatId); return true; }
    if (data === "nav:inbox") {
      if (!await canUseInbox(chatId, telegramUsername)) { await sendControl(chatId, "Диалоги доступны только в настроенном рабочем Telegram-аккаунте."); return true; }
      await people.rememberTelegramInboxWorkChatId(chatId);
      await operatorMenu(chatId);
      return true;
    }
    const user = await linkedUser(chatId);
    if (!user || !projects) { await send(chatId, "Панель недоступна.", undefined, { log: false }); return true; }
    const permissions = await people.permissionsForUser(user.id);
    const projectProblems = data.match(/^nav:project:problems:([0-9a-f-]{36})$/i);
    if (projectProblems) { await renderProjectProblems(chatId, projectProblems[1]!, user.id, permissions); return true; }
    const problemRole = data.match(/^nav:problem:role:([0-9a-f-]{36})$/i);
    if (problemRole) { await renderProblemRole(chatId, problemRole[1]!, user.id, permissions); return true; }
    const crewPerson = data.match(/^nav:crew:person:([0-9a-f-]{36})$/i);
    if (crewPerson) {
      const session = problemSessions.get(chatId);
      if (!session || session.userId !== user.id || !session.selectedRoleId || session.expiresAt < Date.now()) { await sendControl(chatId, "Выбор устарел. Откройте роль заново."); return true; }
      const person = await people.getById(crewPerson[1]!);
      if (!person?.active) { await sendControl(chatId, "Сотрудник больше недоступен."); return true; }
      await sendControl(chatId, `<b>${escapeHtml(publicName(person))}</b>\nКак добавить в роль?`, { inline_keyboard: [
        [{ text: "Добавить", callback_data: `nav:crew:add:${person.id}` }, { text: "Пригласить", callback_data: `nav:crew:invite:${person.id}` }],
        [{ text: "↩ К роли", callback_data: `nav:problem:role:${session.selectedRoleId}` }],
      ] }); return true;
    }
    const crewAction = data.match(/^nav:crew:(add|invite):([0-9a-f-]{36})$/i);
    if (crewAction) {
      const session = problemSessions.get(chatId);
      if (!session || session.userId !== user.id || !session.selectedRoleId || session.expiresAt < Date.now() || !permissions.includes("projects.assignment.manage")) { await sendControl(chatId, "Действие устарело или недоступно."); return true; }
      try {
        await projects.addAssignment({ projectId: session.projectId, roleId: session.selectedRoleId, userId: crewAction[2]!, invite: crewAction[1] === "invite", invitedByUserId: user.id });
        await renderProjectProblems(chatId, session.projectId, user.id, permissions);
      } catch (error) { await sendControl(chatId, escapeHtml(error instanceof Error ? error.message : "Не удалось создать назначение.")); }
      return true;
    }
    const reservations = data.match(/^nav:project:reservations:([0-9a-f-]{36})$/i);
    if (reservations) { await renderReservations(chatId, reservations[1]!, user.id, permissions); return true; }
    const reservationOpen = data.match(/^nav:reservation:open:([0-9a-f-]{36})$/i);
    if (reservationOpen) { await renderReservation(chatId, reservationOpen[1]!, user.id, permissions); return true; }
    if (data === "nav:reservation:add") {
      const session = reservationSessions.get(chatId);
      if (!session || session.userId !== user.id || session.expiresAt < Date.now() || !permissions.includes("projects.reservation.manage")) { await sendControl(chatId, "Действие устарело. Откройте брони заново."); return true; }
      session.awaitingModelSearch = true; session.expiresAt = Date.now() + 15 * 60_000;
      await sendControl(chatId, "<b>Добавить модель</b>\nНапишите название, производителя или тип оборудования.\n\n/cancel — к списку броней"); return true;
    }
    const reservationModel = data.match(/^nav:reservation:model:([0-9a-f-]{36})$/i);
    if (reservationModel) {
      const session = reservationSessions.get(chatId);
      if (!session || session.userId !== user.id || session.expiresAt < Date.now() || !permissions.includes("projects.reservation.manage") || !await isVisibleProject(session.projectId, user.id, permissions)) { await sendControl(chatId, "Действие устарело."); return true; }
      try { await projects.createReservation({ projectId: session.projectId, modelId: reservationModel[1]!, qty: 1 }); await renderReservations(chatId, session.projectId, user.id, permissions); }
      catch (error) { await sendControl(chatId, escapeHtml(error instanceof Error ? error.message : "Не удалось добавить бронь.")); }
      return true;
    }
    const reservationQty = data.match(/^nav:reservation:qty:([0-9a-f-]{36}):(-?1)$/i);
    if (reservationQty) {
      const session = reservationSessions.get(chatId);
      const reservation = session && (await projects.listReservations(session.projectId)).find(item => item.id === reservationQty[1]);
      if (!session || !reservation || session.userId !== user.id || session.expiresAt < Date.now() || !permissions.includes("projects.reservation.manage")) { await sendControl(chatId, "Бронь уже изменилась. Откройте её заново."); return true; }
      try {
        const next = reservation.qty + Number(reservationQty[2]);
        if (next === 0) await projects.deleteReservation(reservation.id); else await projects.updateReservation(reservation.id, { qty: next });
        await renderReservations(chatId, session.projectId, user.id, permissions);
      } catch (error) { await sendControl(chatId, escapeHtml(error instanceof Error ? error.message : "Не удалось изменить бронь.")); }
      return true;
    }
    const reservationUnits = data.match(/^nav:reservation:units:([0-9a-f-]{36})$/i);
    if (reservationUnits) {
      if (!reservationSessions.get(chatId)) {
        const problemSession = problemSessions.get(chatId);
        if (problemSession?.userId === user.id && problemSession.expiresAt >= Date.now()) reservationSessions.set(chatId, { userId: user.id, projectId: problemSession.projectId, awaitingModelSearch: false, selectedReservationId: null, selectedUnitIds: [], expiresAt: Date.now() + 15 * 60_000 });
      }
      await renderReservationUnits(chatId, reservationUnits[1]!, user.id, permissions); return true;
    }
    const reservationUnit = data.match(/^nav:reservation:unit:([0-9a-f-]{36})$/i);
    if (reservationUnit) {
      const session = reservationSessions.get(chatId);
      if (!session || session.userId !== user.id || !session.selectedReservationId || session.expiresAt < Date.now()) { await sendControl(chatId, "Выбор устарел."); return true; }
      session.selectedUnitIds = session.selectedUnitIds.includes(reservationUnit[1]!) ? session.selectedUnitIds.filter(id => id !== reservationUnit[1]) : [...session.selectedUnitIds, reservationUnit[1]!];
      await renderReservationUnits(chatId, session.selectedReservationId, user.id, permissions); return true;
    }
    if (data === "nav:reservation:units:save") {
      const session = reservationSessions.get(chatId);
      if (!session || session.userId !== user.id || !session.selectedReservationId || session.expiresAt < Date.now() || !permissions.includes("projects.reservation.manage")) { await sendControl(chatId, "Выбор устарел."); return true; }
      try { await projects.resolveReservation(session.selectedReservationId, session.selectedUnitIds); await renderReservation(chatId, session.selectedReservationId, user.id, permissions); }
      catch (error) { await sendControl(chatId, escapeHtml(error instanceof Error ? error.message : "Не удалось распределить единицы.")); }
      return true;
    }
    const unit = data.match(/^nav:unit:open:([0-9a-f-]{36})$/i);
    if (unit) {
      if (!equipment || (!permissions.includes("warehouse.view") && !permissions.includes("warehouse.catalog.manage"))) { await sendControl(chatId, "Действие недоступно."); return true; }
      await renderUnitCard(chatId, unit[1]!, user.id, permissions);
      return true;
    }
    const unitWarehouses = data.match(/^nav:unit:warehouses:([0-9a-f-]{36})$/i);
    if (unitWarehouses) {
      if (!equipment || !permissions.includes("warehouse.catalog.manage")) { await sendControl(chatId, "Действие недоступно."); return true; }
      const [unit, warehouses] = await Promise.all([equipment.getUnit(unitWarehouses[1]!), equipment.listWarehouses()]);
      if (!unit || unit.status !== "in_stock") { await sendControl(chatId, "Перемещать можно только единицы на складе."); return true; }
      const targets = warehouses.filter((warehouse) => warehouse.id !== unit.warehouseId);
      if (!targets.length) { await sendControl(chatId, "Нет другого доступного склада."); return true; }
      equipmentSessions.set(chatId, { userId: user.id, awaitingSearch: false, selectedUnitId: unit.id, targetWarehouseId: null, expiresAt: Date.now() + 15 * 60_000 });
      await sendControl(chatId, "<b>Перемещение</b>\nВыберите целевой склад:", { inline_keyboard: [...targets.map((warehouse) => [{ text: warehouse.name.slice(0, 60), callback_data: `nav:unit:target:${warehouse.id}` }]), [{ text: "↩ К оборудованию", callback_data: `nav:unit:open:${unit.id}` }]] });
      return true;
    }
    const target = data.match(/^nav:unit:target:([0-9a-f-]{36})$/i);
    if (target) {
      if (!equipment || !permissions.includes("warehouse.catalog.manage")) { await sendControl(chatId, "Действие недоступно."); return true; }
      const session = equipmentSessions.get(chatId);
      const [unit, warehouses] = await Promise.all([session?.selectedUnitId ? equipment.getUnit(session.selectedUnitId) : Promise.resolve(null), equipment.listWarehouses()]);
      const warehouse = warehouses.find((item) => item.id === target[1]);
      if (!unit || !warehouse || unit.status !== "in_stock" || unit.warehouseId === warehouse.id) { await sendControl(chatId, "Перемещение больше недоступно."); return true; }
      equipmentSessions.set(chatId, { userId: user.id, awaitingSearch: false, selectedUnitId: unit.id, targetWarehouseId: warehouse.id, expiresAt: Date.now() + 15 * 60_000 });
      await sendControl(chatId, `<b>Подтвердите перемещение</b>\n${escapeHtml(unit.assetTag)} → <b>${escapeHtml(warehouse.name)}</b>`, { inline_keyboard: [[{ text: "✅ Переместить", callback_data: `nav:unit:confirm:${unit.id}` }, { text: "Отмена", callback_data: `nav:unit:open:${unit.id}` }]] });
      return true;
    }
    const confirmTransfer = data.match(/^nav:unit:confirm:([0-9a-f-]{36})$/i);
    if (confirmTransfer) {
      const session = equipmentSessions.get(chatId);
      if (!equipment || !permissions.includes("warehouse.catalog.manage") || !session?.targetWarehouseId || session.selectedUnitId !== confirmTransfer[1] || session.userId !== user.id || session.expiresAt < Date.now()) { await sendControl(chatId, "Подтверждение устарело. Начните заново."); return true; }
      try {
        await equipment.transferUnit(confirmTransfer[1]!, session.targetWarehouseId, user.id, "Перемещение через Telegram");
        await renderUnitCard(chatId, confirmTransfer[1]!, user.id, permissions);
      } catch (error) {
        await sendControl(chatId, escapeHtml(error instanceof Error ? error.message : "Не удалось переместить оборудование."));
      }
      return true;
    }
    const open = data.match(/^nav:project:open:([0-9a-f-]{36})$/i);
    if (open) { await renderProjectCard(chatId, open[1]!, user.id, permissions); return true; }
    const financeMenu = data.match(/^nav:project:finance:([0-9a-f-]{36})$/i);
    if (financeMenu) {
      const project = (await visibleProjects(user.id, permissions)).find((item) => item.id === financeMenu[1]);
      if (!project || !permissions.includes("telegram.finance.transactions")) { await sendControl(chatId, "Действие недоступно."); return true; }
      await showProjectFinance(chatId, project);
      return true;
    }
    const clientPayment = data.match(/^nav:finance:client:([0-9a-f-]{36})$/i);
    if (clientPayment) {
      const allowed = (await visibleProjects(user.id, permissions)).some((project) => project.id === clientPayment[1]);
      if (!allowed || !permissions.includes("telegram.finance.transactions")) { await sendControl(chatId, "Действие недоступно."); return true; }
      await clearControlMessages(chatId);
      await startFinanceSession(chatId, clientPayment[1]!, { kind: "income", category: "prepayment" });
      return true;
    }
    const staffPayment = data.match(/^nav:finance:staff:([0-9a-f-]{36})$/i);
    if (staffPayment) {
      const project = (await visibleProjects(user.id, permissions)).find((item) => item.id === staffPayment[1]);
      if (!project || !permissions.includes("telegram.finance.transactions")) { await sendControl(chatId, "Действие недоступно."); return true; }
      await showPayrollRecipients(chatId, project);
      return true;
    }
    const contractorPayment = data.match(/^nav:finance:contractor:([0-9a-f-]{36})$/i);
    if (contractorPayment) {
      const project = (await visibleProjects(user.id, permissions)).find((item) => item.id === contractorPayment[1]);
      if (!project || !permissions.includes("telegram.finance.transactions")) { await sendControl(chatId, "Действие недоступно."); return true; }
      await showContractorRecipients(chatId, project);
      return true;
    }
    const staff = data.match(/^nav:pay:staff:([0-9a-f-]{36})$/i);
    if (staff) {
      const project = await selectedProject(chatId, user.id, permissions);
      const assignment = project ? (await projects.listAssignments(project.id)).find((item) => item.id === staff[1]) : null;
      if (!project || !assignment || !permissions.includes("telegram.finance.transactions")) { await sendControl(chatId, "Действие недоступно."); return true; }
      await clearControlMessages(chatId);
      await startFinanceSession(chatId, project.id, { kind: "expense", category: "salary", assignmentId: assignment.id });
      return true;
    }
    const contractorPay = data.match(/^nav:pay:contractor:([0-9a-f-]{36})$/i);
    if (contractorPay) {
      const project = await selectedProject(chatId, user.id, permissions);
      const valid = project && (await projects.listContractorItems(project.id)).some((item) => item.contractorId === contractorPay[1]);
      if (!project || !valid || !permissions.includes("telegram.finance.transactions")) { await sendControl(chatId, "Действие недоступно."); return true; }
      await clearControlMessages(chatId);
      await startFinanceSession(chatId, project.id, { kind: "expense", category: "other", contractorId: contractorPay[1]! });
      return true;
    }
    const statuses = data.match(/^nav:project:statuses:([0-9a-f-]{36})$/i);
    if (statuses) {
      const project = (await visibleProjects(user.id, permissions)).find((item) => item.id === statuses[1]);
      if (!project || !permissions.includes("projects.manage")) { await sendControl(chatId, "Действие недоступно."); return true; }
      await showStatusPicker(chatId, project);
      return true;
    }
    const status = data.match(/^nav:status:([0-9a-f-]{36}):(draft|confirmed|in_progress|awaiting_payment|cancelled)$/i);
    if (status) {
      const project = (await visibleProjects(user.id, permissions)).find((item) => item.id === status[1]);
      const requested = status[2] as Projects.ProjectStatus;
      if (!project || !permissions.includes("projects.manage") || !MANUALLY_SETTABLE_PROJECT_STATUSES.includes(requested)) { await sendControl(chatId, "Действие недоступно."); return true; }
      try {
        await projects.setStatus(project.id, requested, user.id);
        await renderProjectCard(chatId, project.id, user.id, permissions);
      } catch (error) {
        await sendControl(chatId, escapeHtml(error instanceof Error ? error.message : "Не удалось изменить статус."));
      }
      return true;
    }
    const transaction = data.match(/^nav:project:transaction:([0-9a-f-]{36})$/i);
    if (transaction) {
      const allowed = (await visibleProjects(user.id, permissions)).some((project) => project.id === transaction[1]);
      if (!allowed || !permissions.includes("telegram.finance.transactions")) { await send(chatId, "Действие недоступно.", undefined, { log: false }); return true; }
      await startFinanceSession(chatId, transaction[1]!);
      return true;
    }
    const contractors = data.match(/^nav:project:contractors:([0-9a-f-]{36})$/i);
    if (contractors) {
      const allowed = (await visibleProjects(user.id, permissions)).some((project) => project.id === contractors[1]);
      if (!allowed || !(permissions.includes("operations.contractor_turnover.view") || permissions.includes("operations.contractor_turnover.manage") || permissions.includes("projects.reservation.manage"))) { await send(chatId, "Действие недоступно.", undefined, { log: false }); return true; }
      const orders = await projects.listContractorOrders(contractors[1]!);
      const lines = orders.length ? orders.slice(0, 10).map((order) => `• ${escapeHtml(order.name)} — ${order.booked ? "подтверждён" : "черновик"}`) : ["Заказов подрядчикам пока нет."];
      await sendControl(chatId, `<b>Подрядчики</b>\n${lines.join("\n")}\n\nДля изменения заказа откройте проект в SEVER.`, { inline_keyboard: [[{ text: "↩ К проекту", callback_data: `nav:project:open:${contractors[1]}` }, { text: "☰ Меню", callback_data: "nav:menu" }]] });
      return true;
    }
    return false;
  };

  const handleOperatorMessage = async (chatId: string, msg: NonNullable<Update["message"]>): Promise<boolean> => {
    if (!(await canUseInbox(chatId, msg.from?.username))) return false;
    await people.rememberTelegramInboxWorkChatId(chatId);
    const text = msg.text?.trim() ?? "";
    if (text === "/inbox" || text === "/start" || text === "☰ Диалоги") {
      operatorSessions.set(chatId, { targetTelegramId: null, menuMessageIds: [] });
      await operatorMenu(chatId);
      return true;
    }
    if (text === "↩ Выйти" || text === "/exit") {
      operatorSessions.set(chatId, { targetTelegramId: null, menuMessageIds: [] });
      await projectPanelMenu(chatId, msg.from?.username);
      return true;
    }
    const session = operatorSessions.get(chatId);
    if (!session?.targetTelegramId || !text || text.startsWith("/")) return false;
    await send(session.targetTelegramId, text, undefined, { direction: "operator" });
    await send(chatId, "✓", undefined, { log: false });
    return true;
  };
  const handleApplicationMessage = async (chatId: string, msg: NonNullable<Update["message"]>) => {
    const session = sessions.get(chatId);
    if (!session) return false;
    const c = copy(session);
    const incomingText = msg.text?.trim() ?? "";
    const lowerText = normalizeIntent(incomingText);
    if (!session.lang) {
      const chosen = languageFromText(incomingText);
      if (chosen) {
        session.lang = chosen;
        session.draft.language = chosen;
        session.lastError = null;
        await del(chatId, msg.message_id);
        await send(chatId, copy(session).intro);
        await renderOrSendApplication(chatId, session);
        await replaceQuestion(chatId, session);
        return true;
      }
      if (lowerText === "/cancel" || COPY.ru.cancel.includes(lowerText) || COPY.sr.cancel.includes(lowerText) || COPY.en.cancel.includes(lowerText)) {
        sessions.delete(chatId);
        await del(chatId, msg.message_id);
        if (session.summaryMessageId) await edit(chatId, session.summaryMessageId, CANCELLED_TEXT);
        return true;
      }
      await del(chatId, msg.message_id);
      if (session.summaryMessageId) await edit(chatId, session.summaryMessageId, CHOOSE_LANGUAGE_TEXT, languageKeyboard);
      else {
        const sent = await send(chatId, CHOOSE_LANGUAGE_TEXT, languageKeyboard);
        const messageId = (sent?.result as { message_id?: number } | undefined)?.message_id;
        if (typeof messageId === "number") session.summaryMessageId = messageId;
      }
      return true;
    }
    if (lowerText === "/cancel" || c.cancel.includes(lowerText)) {
      sessions.delete(chatId);
      await del(chatId, msg.message_id);
      if (session.questionMessageId) await del(chatId, session.questionMessageId);
      if (session.summaryMessageId) await edit(chatId, session.summaryMessageId, c.cancelled);
      else await send(chatId, c.cancelled);
      return true;
    }
    session.lastError = null;
    const photo = [...(msg.photo ?? [])].sort((a, b) => (b.file_size ?? 0) - (a.file_size ?? 0))[0];
    if (photo) {
      session.usedSingleAnswers = true;
      session.draft.photoFileId = photo.file_id;
      session.editingField = null;
    } else {
      const text = msg.text?.trim() ?? "";
      const numbered = parseNumberedAnswers(text);
      if (numbered.length > 0) {
        const errors: string[] = [];
        for (const item of numbered) {
          const error = applyTextField(session, item.field, item.value);
          if (error) errors.push(`${c.fieldLabels[item.field]}: ${error}`);
        }
        session.lastError = errors[0] ?? null;
        session.editingField = null;
      } else {
        session.usedSingleAnswers = true;
        const target = session.editingField ?? firstUnansweredField(session) ?? firstRequiredMissingField(session);
        if (!target) {
          if (isAffirmative(session, text)) {
            await del(chatId, msg.message_id);
            await submitApplication(chatId, session);
            return true;
          }
          session.lastError = c.alreadyComplete;
        } else {
          const error = applyTextField(session, target, text);
          session.lastError = error;
          if (!error) session.editingField = null;
        }
      }
    }
    await del(chatId, msg.message_id);
    if (session.questionMessageId) {
      await del(chatId, session.questionMessageId);
      session.questionMessageId = null;
    }
    await renderOrSendApplication(chatId, session);
    await replaceQuestion(chatId, session);
    return true;
  };

  async function handleCallback(cb: NonNullable<Update["callback_query"]>) {
    const fromChatId = String(cb.from.id);
    const data = cb.data ?? "";
    if (/^nav:(?:reservation:(?:model|qty|units:save)|crew:(?:add|invite))/.test(data)) {
      const key = `${fromChatId}:${data}`;
      const previous = recentCallbacks.get(key) ?? 0;
      if (Date.now() - previous < 4_000) {
        await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Действие уже выполняется." });
        return;
      }
      recentCallbacks.set(key, Date.now());
    }
    if (data.startsWith("nav:")) {
      try {
        await handleProjectCallback(data, fromChatId, cb.from.username);
        await tg("answerCallbackQuery", { callback_query_id: cb.id });
      } catch {
        await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Не удалось обработать действие." });
      }
      return;
    }
    if (data.startsWith("tx:")) {
      try {
        await handleFinanceCallback(data, fromChatId);
        await tg("answerCallbackQuery", { callback_query_id: cb.id });
      } catch {
        await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Не удалось обработать действие." });
      }
      return;
    }
    if (data.startsWith("inbox:")) {
      if (!await canUseInbox(fromChatId, cb.from.username)) {
        await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Диалоги недоступны." });
        return;
      }
      await people.rememberTelegramInboxWorkChatId(fromChatId);
      if (data === "inbox:exit") {
        operatorSessions.set(fromChatId, { targetTelegramId: null, menuMessageIds: [] });
        await tg("answerCallbackQuery", { callback_query_id: cb.id });
        await projectPanelMenu(fromChatId, cb.from.username);
        return;
      }
      const openMatch = data.match(/^inbox:open:(.+)$/);
      if (openMatch) {
        await tg("answerCallbackQuery", { callback_query_id: cb.id });
        await sendDialogHistory(fromChatId, openMatch[1]!);
        return;
      }
      const pageMatch = data.match(/^inbox:page:(\d+)$/);
      if (pageMatch) {
        await tg("answerCallbackQuery", { callback_query_id: cb.id });
        await operatorMenu(fromChatId, Number(pageMatch[1]));
        return;
      }
    }
    if (data.startsWith("app:")) {
      const session = sessions.get(fromChatId);
      if (!session) {
        await tg("answerCallbackQuery", { callback_query_id: cb.id, text: INACTIVE_TEXT });
        return;
      }
      const langMatch = data.match(/^app:lang:(ru|sr|en)$/);
      if (langMatch) {
        session.lang = langMatch[1] as BotLang;
        session.draft.language = session.lang;
        session.lastError = null;
        await tg("answerCallbackQuery", { callback_query_id: cb.id });
        await send(fromChatId, copy(session).intro);
        await renderOrSendApplication(fromChatId, session);
        await replaceQuestion(fromChatId, session);
        return;
      }
      if (!session.lang) {
        await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Choose language / Izaberite jezik / Выберите язык" });
        return;
      }
      if (data === "app:edit") {
        await tg("answerCallbackQuery", { callback_query_id: cb.id });
        await renderOrSendApplication(fromChatId, session, true);
        if (session.questionMessageId) {
          await del(fromChatId, session.questionMessageId);
          session.questionMessageId = null;
        }
        return;
      }
      if (data === "app:done") {
        session.editingField = null;
        await tg("answerCallbackQuery", { callback_query_id: cb.id });
        await renderOrSendApplication(fromChatId, session);
        await replaceQuestion(fromChatId, session);
        return;
      }
      if (data === "app:submit") {
        await tg("answerCallbackQuery", { callback_query_id: cb.id });
        await submitApplication(fromChatId, session);
        return;
      }
      const fieldMatch = data.match(/^app:field:(.+)$/);
      if (fieldMatch) {
        session.editingField = fieldMatch[1] as ApplicationField;
        session.lastError = null;
        await tg("answerCallbackQuery", { callback_query_id: cb.id });
        await renderOrSendApplication(fromChatId, session);
        await replaceQuestion(fromChatId, session);
        return;
      }
    }
    let text: string | null = null;
    try {
      text = onCallback ? await onCallback(cb.data ?? "", fromChatId) : null;
    } catch {
      text = "Не удалось обработать действие.";
    }
    // Stop the button's spinner.
    await tg("answerCallbackQuery", { callback_query_id: cb.id, text: text ?? undefined });
    // Replace the invite message (and drop its buttons) with the outcome.
    if (text && cb.message) {
      await tg("editMessageText", {
        chat_id: cb.message.chat.id,
        message_id: cb.message.message_id,
        text,
        parse_mode: "HTML",
      });
    }
  }

  async function loop() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const res = await tg("getUpdates", { offset, timeout: 25 });
        const updates = (res?.result as Update[] | undefined) ?? [];
        for (const u of updates) {
          offset = u.update_id + 1;
          if (u.callback_query) {
            await handleCallback(u.callback_query);
            continue;
          }
          const msg = u.message;
          if (!msg?.text && !msg?.photo) continue;
          const chatId = String(msg.chat.id);
          const username = msg.from?.username;
          const text = msg.text?.trim() ?? "";
          const codeMatch = text.match(/^\/start\s+(\S+)/);
          try {
            if (await handleFinanceMessage(chatId, msg)) continue;
            if (await handleProjectMessage(chatId, msg)) continue;
            if (await handleEquipmentMessage(chatId, msg)) continue;
            if (await handleOperatorMessage(chatId, msg)) continue;
            const isCommand = text.startsWith("/");
            const incoming = !isCommand ? await logIncomingMessage(chatId, msg) : null;
            if (!text.startsWith("/start") && await handleApplicationMessage(chatId, msg)) continue;
            if (codeMatch) {
              // Deep-link path: the link carries the exact account id.
              const userId = codeMatch[1]!;
              const user = await people.getById(userId);
              if (user?.active) {
                const currentHolder = (await people.list("all")).find((person) => person.telegramId === chatId && person.id !== userId);
                if (currentHolder) {
                  await send(
                    chatId,
                    `Этот Telegram уже привязан к карточке <b>${publicName(currentHolder)}</b>. Попросите администратора сначала нажать «Отвязать Telegram» в этой карточке.`
                  );
                  continue;
                }
                await people.update(userId, { telegramId: chatId, telegramUsername: username ?? user.telegramUsername });
                await send(chatId, `✅ Telegram привязан к аккаунту <b>${publicName(user)}</b>. Уведомления будут приходить сюда.`);
              } else {
                await send(chatId, `Не нашёл активный аккаунт по ссылке. Попросите отправить новую ссылку.`);
              }
              continue;
            }
            // Otherwise match by @username, pre-filled by an admin on the card.
            const users = await people.list();
            const already = users.find((p) => p.telegramId === chatId);
            if (already) {
              if (incoming) await notifyWorkAccount(chatId, username, incoming.displayName, incoming.text, incoming.type);
              else await send(chatId, `Вы уже привязаны к аккаунту <b>${publicName(already)}</b>.`);
              continue;
            }
            const norm = normHandle(username);
            const match = norm ? users.find((p) => normHandle(p.telegramUsername) === norm) : undefined;
            if (match) {
              await people.update(match.id, { telegramId: chatId, telegramUsername: username ?? match.telegramUsername });
              await send(chatId, `✅ Telegram привязан к аккаунту <b>${publicName(match)}</b>. Уведомления будут приходить сюда.`);
            } else {
              await startApplication(chatId, username ? `@${username}` : null);
            }
          } catch {
            await send(chatId, `Не удалось обработать сообщение. Попробуйте ещё раз позже.`);
          }
        }
      } catch {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  void loop();
  // eslint-disable-next-line no-console
  console.log("[telegram] bot polling started");
}
