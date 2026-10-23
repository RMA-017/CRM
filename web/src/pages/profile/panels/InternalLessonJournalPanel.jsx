import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../../i18n/I18nProvider.jsx";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";
import { buildExportFilename, exportExcelWorkbook } from "../../../lib/excel-export.js";
import "../../../css/components/internal-lessons.css";

const TEXT = {
  uz: {
    filter: "Filtr", apply: "Qo‘llash", reset: "Tozalash", period: "Davr", today: "Bugun", week: "Oxirgi 7 kun", month: "Shu oy", custom: "Ixtiyoriy davr", excel: "Excel’ga eksport",
    title: "Ichki darslar jurnali", date: "Sana", child: "Bola", specialist: "Mutaxassis", position: "Lavozim", action: "Amal",
    from: "Sanadan", to: "Sanagacha", search: "Qidirish", placeholder: "Bola, mutaxassis yoki lavozim", status: "Holat", all: "Barchasi",
    marked: "Belgilandi", unmarked: "Belgi bekor qilindi", undo: "Belgini bekor qilish", restore: "Belgini qaytarish",
    refresh: "Yangilash", close: "Yopish", loading: "Yuklanmoqda...", empty: "Jurnal yozuvlari topilmadi.", previous: "Oldingi", next: "Keyingi",
    confirm: "Tasdiqlash", cancel: "Bekor qilish", actor: "Bajargan", records: "Yozuvlar", failure: "Amalni bajarib bo‘lmadi.",
    hint: "Sana — tugma bosilgan haqiqiy sana. Belgilash, bekor qilish va tuzatishlar alohida yozuv bo‘lib saqlanadi.",
    errors: { MIGRATION_REQUIRED: "Ma’lumotlar bazasi migratsiyasini bajarish kerak.", INVALID_DATE_RANGE: "Sana oralig‘ini to‘g‘ri kiriting.",
      JOURNAL_CHANGED: "Bu yozuv o‘zgargan. Jurnalni yangilang.", LESSON_NOT_FOUND: "Jurnal yozuvi topilmadi.", "Forbidden.": "Bu amal uchun ruxsat yo‘q." }
  },
  ru: {
    filter: "Фильтр", apply: "Применить", reset: "Сбросить", period: "Период", today: "Сегодня", week: "Последние 7 дней", month: "Текущий месяц", custom: "Произвольный период", excel: "Экспорт в Excel",
    title: "Журнал внутренних занятий", date: "Дата", child: "Ребёнок", specialist: "Специалист", position: "Должность", action: "Действие",
    from: "С даты", to: "По дату", search: "Поиск", placeholder: "Ребёнок, специалист или должность", status: "Состояние", all: "Все",
    marked: "Отмечено", unmarked: "Отметка снята", undo: "Снять отметку", restore: "Вернуть отметку",
    refresh: "Обновить", close: "Закрыть", loading: "Загрузка...", empty: "Записи журнала не найдены.", previous: "Назад", next: "Далее",
    confirm: "Подтвердить", cancel: "Отмена", actor: "Кто выполнил", records: "Записей", failure: "Не удалось выполнить действие.",
    hint: "Дата — фактическая дата нажатия. Установка, снятие и корректировки отметки сохраняются отдельными записями.",
    errors: { MIGRATION_REQUIRED: "Необходимо выполнить миграцию базы данных.", INVALID_DATE_RANGE: "Введите корректный период.",
      JOURNAL_CHANGED: "Запись уже изменена. Обновите журнал.", LESSON_NOT_FOUND: "Запись журнала не найдена.", "Forbidden.": "Нет доступа для этого действия." }
  }
};

async function request(path, options = {}) {
  const response = await apiFetch(`/api/internal-lesson-journal${path}`, options);
  const data = await readApiResponseData(response);
  if (!response.ok) throw new Error(data?.message || "Request failed");
  return data;
}

function CorrectionDialog({ item, ui, busy, error, onClose, onConfirm }) {
  const dialogRef = useRef(null);
  useEffect(() => { dialogRef.current?.showModal(); }, []);
  return createPortal(<dialog ref={dialogRef} className="internal-lesson-dialog" aria-labelledby="journalCorrectionTitle"
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <h3 id="journalCorrectionTitle">{item.currentCompleted ? ui.undo : ui.restore}</h3>
    <p>{item.clientName} · {item.specialistName}</p>
    {error && <p className="internal-lesson-error" role="alert">{error}</p>}
    <div className="internal-lesson-editor-actions">
      <button type="button" className="header-btn" disabled={busy} onClick={onClose}>{ui.cancel}</button>
      <button type="button" className="btn" disabled={busy} onClick={onConfirm}>{busy ? ui.loading : ui.confirm}</button>
    </div>
  </dialog>, document.body);
}

export default function InternalLessonJournalPanel({ access, onClose }) {
  const { language } = useI18n();
  const ui = TEXT[language] || TEXT.uz;
  const emptyFilters = { q: "", dateFrom: "", dateTo: "", completed: "", child: "", specialist: "", position: "" };
  const [draft, setDraft] = useState(emptyFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [period, setPeriod] = useState("all");
  const [filters, setFilters] = useState(draft);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [target, setTarget] = useState(null);
  const [correcting, setCorrecting] = useState(false);
  const [correctionError, setCorrectionError] = useState("");
  const busy = useRef(false);
  const errorText = useCallback((message) => ui.errors[message] || ui.failure, [ui]);

  useEffect(() => {
    function refresh() { setRevision((value) => value + 1); }
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ page: String(page) });
    for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
    request(`/?${query}`, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) { setItems(data.items); setPagination(data.pagination); } })
      .catch((err) => { if (!controller.signal.aborted) setError(errorText(err.message)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, page, revision, errorText]);

  async function exportAll() {
    setExporting(true);
    try {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
      const data = await request(`/export?${query}`);
      exportExcelWorkbook(buildExportFilename("internal-lesson-journal"), [{ name: ui.title, rows: [
        ["ID", ui.date, ui.child, ui.specialist, ui.position, ui.action, ui.actor],
        ...data.items.map((item) => [item.id,
          new Date(item.recordedAt).toLocaleString(language === "ru" ? "ru-RU" : "uz-UZ", { timeZone: "Asia/Tashkent" }),
          item.clientName, item.specialistName, item.positionName, item.completed ? ui.marked : ui.unmarked, item.actorName])
      ] }]);
    } catch (err) { setError(errorText(err.message)); }
    finally { setExporting(false); }
  }

  async function correct() {
    if (busy.current) return;
    busy.current = true;
    setCorrecting(true);
    setCorrectionError("");
    try {
      await request(`/${target.completionId}`, { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !target.currentCompleted, expectedVersion: target.currentVersion }) });
      setTarget(null);
      setRevision((value) => value + 1);
    } catch (err) { setCorrectionError(errorText(err.message)); }
    finally { setCorrecting(false); busy.current = false; }
  }

  return <section className="all-users-panel">
    <div className="all-users-head"><h3>{ui.title}</h3><div className="all-users-head-actions">
      <button type="button" className="header-btn" aria-expanded={filterOpen} aria-controls="journalFilters" onClick={() => setFilterOpen(!filterOpen)}>{ui.filter}{Object.values(filters).some(Boolean) ? " ●" : ""}</button>
      <button type="button" className="header-btn" disabled={exporting || loading || Boolean(error)} onClick={exportAll}>{exporting ? ui.loading : ui.excel}</button>
      <button type="button" className="header-btn" disabled={loading} onClick={() => setRevision((value) => value + 1)}>{ui.refresh}</button>
      <button type="button" className="header-btn panel-close-btn" aria-label={ui.close} onClick={onClose}>×</button>
    </div></div>
    <p className="internal-lesson-hint">{ui.hint}</p>
    {filterOpen && <form id="journalFilters" className="internal-journal-filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setFilters({ ...draft }); }}>
      <label className="field">{ui.period}<select value={period} onChange={(e) => {
        const value = e.target.value;
        setPeriod(value);
        if (value === "custom") return;
        const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
        const start = new Date(`${today}T12:00:00Z`);
        if (value === "week") start.setUTCDate(start.getUTCDate() - 6);
        if (value === "month") start.setUTCDate(1);
        setDraft({ ...draft, dateFrom: value === "all" ? "" : start.toISOString().slice(0, 10), dateTo: value === "all" ? "" : today });
      }}><option value="all">{ui.all}</option><option value="today">{ui.today}</option><option value="week">{ui.week}</option><option value="month">{ui.month}</option><option value="custom">{ui.custom}</option></select></label>
      <label className="field">{ui.from}<input type="date" value={draft.dateFrom} max={draft.dateTo || undefined} onChange={(e) => { setPeriod("custom"); setDraft({ ...draft, dateFrom: e.target.value }); }} /></label>
      <label className="field">{ui.to}<input type="date" value={draft.dateTo} min={draft.dateFrom || undefined} onChange={(e) => { setPeriod("custom"); setDraft({ ...draft, dateTo: e.target.value }); }} /></label>
      {["child", "specialist", "position"].map((key) => <label className="field" key={key}>{ui[key]}<input type="search" maxLength={255} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} /></label>)}
      <label className="field">{ui.search}<input type="search" maxLength={255} placeholder={ui.placeholder} value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} /></label>
      <label className="field">{ui.status}<select value={draft.completed} onChange={(e) => setDraft({ ...draft, completed: e.target.value })}>
        <option value="">{ui.all}</option><option value="true">{ui.marked}</option><option value="false">{ui.unmarked}</option>
      </select></label>
      <button type="submit" className="btn" disabled={loading}>{ui.apply}</button>
      <button type="button" className="header-btn" disabled={loading} onClick={() => { setDraft(emptyFilters); setFilters(emptyFilters); setPeriod("all"); setPage(1); }}>{ui.reset}</button>
    </form>}
    {error && <p role="alert" className="internal-lesson-error">{error}</p>}
    {loading ? <p role="status">{ui.loading}</p> : <>
      <div className="all-users-table-wrap"><table className="all-users-table">
        <thead><tr><th>{ui.date}</th><th>{ui.child}</th><th>{ui.specialist}</th><th>{ui.position}</th><th>{ui.action}</th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.id}>
          <td>{new Date(item.recordedAt).toLocaleDateString(language === "ru" ? "ru-RU" : "uz-UZ", { timeZone: "Asia/Tashkent" })}
            <small className="internal-journal-time">{new Date(item.recordedAt).toLocaleTimeString(language === "ru" ? "ru-RU" : "uz-UZ", { timeZone: "Asia/Tashkent", hour: "2-digit", minute: "2-digit" })}</small>
          </td>
          <td>{item.clientName}</td><td>{item.specialistName}</td><td>{item.positionName || "—"}</td>
          <td title={`${ui.actor}: ${item.actorName || "—"}`}>
            <span>{item.completed ? `✅ ${ui.marked}` : `↩️ ${ui.unmarked}`}</span>
            {access.update && item.version === item.currentVersion && <button type="button" className="header-btn" onClick={() => { setCorrectionError(""); setTarget(item); }}>
              {item.currentCompleted ? ui.undo : ui.restore}
            </button>}
          </td>
        </tr>)}</tbody>
      </table></div>
      {items.length === 0 && !error && <p>{ui.empty}</p>}
      <div className="all-users-pagination">
        <button type="button" disabled={pagination.page <= 1} onClick={() => setPage(pagination.page - 1)}>{ui.previous}</button>
        <span>{pagination.page} / {pagination.totalPages} · {ui.records}: {pagination.total}</span>
        <button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage(pagination.page + 1)}>{ui.next}</button>
      </div>
    </>}
    {target && <CorrectionDialog item={target} ui={ui} busy={correcting} error={correctionError} onClose={() => setTarget(null)} onConfirm={correct} />}
  </section>;
}
