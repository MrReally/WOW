import { env } from "../env.js";
import type { People } from "@sever/contracts";

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
    from?: { username?: string };
    chat: { id: number };
  };
  callback_query?: { id: string; data?: string; from: { id: number }; message?: { chat: { id: number }; message_id: number } };
}

export function startTelegramBot(deps: BotDeps): void {
  const { people, onCallback } = deps;
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
  const publicName = (user: { nickname?: string | null; displayName?: string | null }) =>
    user.nickname?.trim() || user.displayName?.trim() || "аккаунт";
  const sessions = new Map<string, ApplicationSession>();
  const operatorSessions = new Map<string, OperatorSession>();
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
      const match = line.match(/^\s*(\d{1,2})[.)]\s*(.+)\s*$/);
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
  const participantLabel = (p: People.TelegramDialogParticipantDTO): string =>
    p.displayName?.trim() || (p.telegramUsername ? `@${p.telegramUsername.replace(/^@/, "")}` : p.telegramId);
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
  const compactDateTime = (iso: string): string => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const operatorMenu = async (operatorChatId: string) => {
    await clearOperatorMessages(operatorChatId);
    const participants = await people.listTelegramDialogParticipants();
    const rows = participants.slice(0, 24).reduce<{ text: string; callback_data: string }[][]>((acc, p, index) => {
      const rowIndex = Math.floor(index / 2);
      acc[rowIndex] ??= [];
      acc[rowIndex]!.push({ text: participantLabel(p).slice(0, 28), callback_data: `inbox:open:${p.telegramId}` });
      return acc;
    }, []);
    rows.push([{ text: "↩ Выйти", callback_data: "inbox:exit" }]);
    rememberOperatorMessage(operatorChatId, await send(operatorChatId, "Inbox", operatorReplyKeyboard, { log: false }));
    const sent = await send(
      operatorChatId,
      `<b>SEVER Inbox</b>\nВыберите диалог.`,
      { inline_keyboard: rows },
      { log: false }
    );
    rememberOperatorMessage(operatorChatId, sent);
  };
  const renderDialogLine = (m: People.TelegramDialogMessageDTO): string => {
    const label = m.direction === "user" ? "👤" : m.direction === "operator" ? "SEVER" : "🤖";
    const type = m.messageType === "photo" ? " [photo]" : "";
    const text = escapeHtml(stripHtml(m.text) || type.trim() || "—");
    const body = m.deletedAt ? `<s>${text}</s>` : text;
    return `${compactDateTime(m.createdAt)} ${label} ${body}`;
  };
  const sendDialogHistory = async (operatorChatId: string, targetTelegramId: string) => {
    await clearOperatorMessages(operatorChatId);
    const [participants, messages] = await Promise.all([
      people.listTelegramDialogParticipants(),
      people.listTelegramDialogMessages(targetTelegramId, 80),
    ]);
    const participant = participants.find((p) => p.telegramId === targetTelegramId);
    const title = participant ? participantLabel(participant) : targetTelegramId;
    const chunks: string[] = [];
    let current = `<b>Диалог: ${escapeHtml(title)}</b>\n<code>#tg_${escapeHtml(targetTelegramId)}</code>\n\n`;
    for (const message of messages) {
      const line = `${renderDialogLine(message)}\n`;
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
  const notifyWorkAccount = async (fromChatId: string, username: string | null | undefined, text: string, type: People.TelegramMessageType) => {
    const workChatId = await people.getTelegramInboxWorkChatId();
    if (!workChatId || workChatId === fromChatId) return;
    const users = await people.list("all");
    const user = users.find((item) => item.telegramId === fromChatId);
    const name = user ? publicName(user) : username ? `@${username}` : fromChatId;
    const body = [
      `<b>Новое сообщение в бот</b>`,
      `${escapeHtml(name)} · <code>#tg_${escapeHtml(fromChatId)}</code>`,
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
    await people.logTelegramDialogMessage({
      telegramId: chatId,
      telegramUsername: msg.from?.username ? `@${msg.from.username}` : null,
      direction: "user",
      messageType: type,
      text,
      telegramMessageId: msg.message_id,
    });
    return { text, type };
  };
  const handleOperatorMessage = async (chatId: string, msg: NonNullable<Update["message"]>): Promise<boolean> => {
    if (!(await isWorkAccount(msg.from?.username))) return false;
    await people.rememberTelegramInboxWorkChatId(chatId);
    const text = msg.text?.trim() ?? "";
    if (text === "/inbox" || text === "/start" || text === "☰ Диалоги") {
      operatorSessions.set(chatId, { targetTelegramId: null, menuMessageIds: [] });
      await operatorMenu(chatId);
      return true;
    }
    if (text === "↩ Выйти" || text === "/exit") {
      operatorSessions.set(chatId, { targetTelegramId: null, menuMessageIds: [] });
      await send(chatId, "Режим ответа выключен.", operatorReplyKeyboard, { log: false });
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
    if (data.startsWith("inbox:")) {
      await people.rememberTelegramInboxWorkChatId(fromChatId);
      if (data === "inbox:exit") {
        operatorSessions.set(fromChatId, { targetTelegramId: null, menuMessageIds: [] });
        await tg("answerCallbackQuery", { callback_query_id: cb.id });
        await send(fromChatId, "Режим ответа выключен.", operatorReplyKeyboard, { log: false });
        return;
      }
      const openMatch = data.match(/^inbox:open:(.+)$/);
      if (openMatch) {
        await tg("answerCallbackQuery", { callback_query_id: cb.id });
        await sendDialogHistory(fromChatId, openMatch[1]!);
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
            if (await handleOperatorMessage(chatId, msg)) continue;
            const isCommand = text.startsWith("/");
            const incoming = !isCommand ? await logIncomingMessage(chatId, msg) : null;
            if (!text.startsWith("/start") && await handleApplicationMessage(chatId, msg)) continue;
            if (codeMatch) {
              // Deep-link path: the link carries the exact account id.
              const userId = codeMatch[1]!;
              const user = await people.getById(userId);
              if (user) {
                await people.update(userId, { telegramId: chatId });
                await send(chatId, `✅ Telegram привязан к аккаунту <b>${publicName(user)}</b>. Уведомления будут приходить сюда.`);
              } else {
                await send(chatId, `Не нашёл аккаунт по коду. Ваш chat_id: <code>${chatId}</code>`);
              }
              continue;
            }
            // Otherwise match by @username, pre-filled by an admin on the card.
            const users = await people.list();
            const already = users.find((p) => p.telegramId === chatId);
            if (already) {
              if (incoming) await notifyWorkAccount(chatId, username, incoming.text, incoming.type);
              else await send(chatId, `Вы уже привязаны к аккаунту <b>${publicName(already)}</b>.`);
              continue;
            }
            const norm = normHandle(username);
            const match = norm ? users.find((p) => normHandle(p.telegramId) === norm) : undefined;
            if (match) {
              await people.update(match.id, { telegramId: chatId });
              await send(chatId, `✅ Telegram привязан к аккаунту <b>${publicName(match)}</b>. Уведомления будут приходить сюда.`);
            } else {
              await startApplication(chatId, username ? `@${username}` : null);
            }
          } catch {
            await send(chatId, `Ваш chat_id: <code>${chatId}</code>`);
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
