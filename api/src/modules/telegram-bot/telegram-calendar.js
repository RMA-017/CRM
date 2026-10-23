export const BOT_UI_TEXT = Object.freeze({
  uz: {
    main: "Bosh menyu", parent: "👶 Mening farzandim", caregiver: "👩‍🏫 Men tarbiyachiman", specialist: "👩‍⚕️ Men mutaxassisman",
    settings: "⚙️ Sozlamalar", back: "⬅️ Ortga", contact: "📱 Kontakt yuborish", askContact: "Telefon raqamingizni Telegram kontakt tugmasi orqali yuboring.",
    ownContact: "Faqat o‘zingizning kontaktingizni yuboring.", contactSaved: "Kontakt saqlandi.", noAccess: "Kontakt topilmadi yoki ruxsat bekor qilingan. Administratorga murojaat qiling.",
    chooseRole: "Avval bosh menyudan bo‘limni tanlang.", children: "Biriktirilgan bolalar", noChildren: "Biriktirilgan bolalar topilmadi.",
    today: "📅 Bugungi dars jadvali", week: "🗓 Haftalik jadval / kalendar", school: "🏫 Maktab-bog‘cha", therapy: "🧩 Terapiya",
    calendar: "Kunni tanlang", noLessons: "Bu kunda darslar yo‘q.", child: "Bola", staff: "Mutaxassis", recurring: "Doimiy ichki dars jadvali",
    changeParent: "Ota-ona kontaktini almashtirish", changeCaregiver: "Tarbiyachi kontaktini almashtirish", changeSpecialist: "Mutaxassis kontaktini almashtirish",
    language: "Til va kontakt sozlamalari", weekdays: ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"],
    statuses: { pending: "Rejalashtirilgan", confirmed: "Tasdiqlangan", cancelled: "Bekor qilingan", "no-show": "Kelmagan" }
  },
  ru: {
    main: "Главное меню", parent: "👶 Мой ребёнок", caregiver: "👩‍🏫 Я воспитатель", specialist: "👩‍⚕️ Я специалист",
    settings: "⚙️ Настройки", back: "⬅️ Назад", contact: "📱 Отправить контакт", askContact: "Отправьте свой номер через кнопку контакта Telegram.",
    ownContact: "Отправьте только свой контакт.", contactSaved: "Контакт сохранён.", noAccess: "Контакт не найден или доступ отменён. Обратитесь к администратору.",
    chooseRole: "Сначала выберите раздел в главном меню.", children: "Закреплённые дети", noChildren: "Закреплённые дети не найдены.",
    today: "📅 Расписание на сегодня", week: "🗓 Расписание на неделю / календарь", school: "🏫 Школа-садик", therapy: "🧩 Терапия",
    calendar: "Выберите день", noLessons: "В этот день занятий нет.", child: "Ребёнок", staff: "Специалист", recurring: "Постоянное расписание внутренних занятий",
    changeParent: "Изменить контакт родителя", changeCaregiver: "Изменить контакт воспитателя", changeSpecialist: "Изменить контакт специалиста",
    language: "Язык и контакты", weekdays: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
    statuses: { pending: "Запланировано", confirmed: "Подтверждено", cancelled: "Отменено", "no-show": "Не пришёл" }
  }
});

export function isBotDate(value) {
  if (!/^(19|20|21)\d{2}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function botToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return `${parts.find((p) => p.type === "year").value}-${parts.find((p) => p.type === "month").value}-${parts.find((p) => p.type === "day").value}`;
}

export function shiftBotDate(value, days) {
  if (!isBotDate(value)) return botToday();
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  const next = date.toISOString().slice(0, 10);
  return isBotDate(next) ? next : value;
}

export function botDayLabel(value, language) {
  return new Intl.DateTimeFormat(language === "uz" ? "uz-UZ" : "ru-RU", {
    timeZone: "Asia/Tashkent", weekday: "long", day: "2-digit", month: "long", year: "numeric"
  }).format(new Date(`${value}T07:00:00Z`));
}

export function botButton(text, data) { return { text, callback_data: data }; }

export function buildBotDateNavigation(language, date, back = "ui:home") {
  const ui = BOT_UI_TEXT[language] || BOT_UI_TEXT.ru;
  return [
    [botButton("◀️", `ui:day:${shiftBotDate(date, -1)}`), botButton("📅", `ui:calendar:${date.slice(0, 7)}`), botButton("▶️", `ui:day:${shiftBotDate(date, 1)}`)],
    [botButton(ui.back, back)]
  ];
}

export function buildBotCalendar(language, month, selectedDate = botToday()) {
  const ui = BOT_UI_TEXT[language] || BOT_UI_TEXT.ru;
  const first = `${month}-01`;
  if (!isBotDate(first)) throw new Error("Invalid calendar month");
  const start = new Date(`${first}T12:00:00Z`);
  const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 12));
  const previous = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1, 12)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1, 12)).toISOString().slice(0, 7);
  const title = new Intl.DateTimeFormat(language === "uz" ? "uz-UZ" : "ru-RU", { month: "long", year: "numeric", timeZone: "UTC" }).format(start);
  const rows = [[botButton("◀️", isBotDate(`${previous}-01`) ? `ui:calendar:${previous}` : "ui:noop"), botButton(title, "ui:noop"), botButton("▶️", isBotDate(`${next}-01`) ? `ui:calendar:${next}` : "ui:noop")],
    ui.weekdays.map((label) => botButton(label, "ui:noop"))];
  const cells = Array.from({ length: (start.getUTCDay() + 6) % 7 }, () => botButton("·", "ui:noop"));
  for (let day = 1; day <= last.getUTCDate(); day++) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    cells.push(botButton(date === selectedDate ? `• ${day} •` : String(day), `ui:day:${date}`));
  }
  while (cells.length % 7) cells.push(botButton("·", "ui:noop"));
  for (let offset = 0; offset < cells.length; offset += 7) rows.push(cells.slice(offset, offset + 7));
  rows.push([botButton(ui.back, `ui:day:${selectedDate}`)]);
  return { text: `${ui.calendar}\n${title}`, replyMarkup: { inline_keyboard: rows } };
}

export function splitBotScreen(text, limit = 3800) {
  const chunks = [];
  let current = "";
  for (const character of String(text || " ")) {
    if (current.length + character.length > limit) { chunks.push(current); current = ""; }
    current += character;
  }
  chunks.push(current || " ");
  return chunks;
}
