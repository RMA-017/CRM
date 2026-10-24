import { createPortal } from "react-dom";
import { useEscapeKey } from "../../../lib/use-escape-key.js";
import ActionIconButton from "../../../components/ActionIconButton.jsx";
import { useCallback, useEffect, useRef, useState } from "react";
import CompactDialog from "../../../components/CompactDialog.jsx";
import CustomSelect from "../../../components/CustomSelect.jsx";
import { useI18n } from "../../../i18n/I18nProvider.jsx";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";
import { buildExportFilename, exportExcelWorkbook } from "../../../lib/excel-export.js";
import "../../../css/components/internal-lessons.css";

const TEXT = {
  uz: {
    edit: "Tahrirlash", remove: "O‘chirish", save: "Saqlash", select: "Tanlang", removeConfirm: "Jurnaldan ushbu belgini o‘chirasizmi?",
    filter: "Filtr", apply: "Qo‘llash", reset: "Tozalash", period: "Davr", today: "Bugun", week: "Oxirgi 7 kun", month: "Shu oy", custom: "Ixtiyoriy davr", excel: "Excel’ga eksport",
    title: "Jurnal", date: "Sana", child: "Bola", specialist: "Mutaxassis", position: "Lavozim", action: "Amal",
    from: "Sanadan", to: "Sanagacha", search: "Qidirish", placeholder: "Bola, mutaxassis yoki lavozim", status: "Holat", all: "Barchasi",
    marked: "Belgilandi", unmarked: "Belgi bekor qilindi", undo: "Belgini bekor qilish", restore: "Belgini qaytarish",
    refresh: "Yangilash", close: "Yopish", loading: "Yuklanmoqda...", empty: "Jurnal yozuvlari topilmadi.", previous: "Oldingi", next: "Keyingi",
    confirm: "Tasdiqlash", cancel: "Bekor qilish", actor: "Bajargan", records: "Yozuvlar", failure: "Amalni bajarib bo‘lmadi.",
    hint: "Sana — tugma bosilgan haqiqiy sana. Belgilash, bekor qilish va tuzatishlar alohida yozuv bo‘lib saqlanadi.",
    errors: { INVALID_CLIENT: "Bolani qayta tanlang.", INVALID_SPECIALIST: "Mutaxassisni qayta tanlang.", MIGRATION_REQUIRED: "Ma’lumotlar bazasi migratsiyasini bajarish kerak.", INVALID_DATE_RANGE: "Sana oralig‘ini to‘g‘ri kiriting.",
      JOURNAL_CHANGED: "Bu yozuv o‘zgargan. Jurnalni yangilang.", LESSON_NOT_FOUND: "Jurnal yozuvi topilmadi.", "Forbidden.": "Bu amal uchun ruxsat yo‘q." }
  },
  ru: {
    edit: "Редактировать", remove: "Удалить", save: "Сохранить", select: "Выберите", removeConfirm: "Удалить эту отметку из журнала?",
    filter: "Фильтр", apply: "Применить", reset: "Сбросить", period: "Период", today: "Сегодня", week: "Последние 7 дней", month: "Текущий месяц", custom: "Произвольный период", excel: "Экспорт в Excel",
    title: "Журнал", date: "Дата", child: "Ребёнок", specialist: "Специалист", position: "Должность", action: "Действие",
    from: "С даты", to: "По дату", search: "Поиск", placeholder: "Ребёнок, специалист или должность", status: "Состояние", all: "Все",
    marked: "Отмечено", unmarked: "Отметка снята", undo: "Снять отметку", restore: "Вернуть отметку",
    refresh: "Обновить", close: "Закрыть", loading: "Загрузка...", empty: "Записи журнала не найдены.", previous: "Назад", next: "Далее",
    confirm: "Подтвердить", cancel: "Отмена", actor: "Кто выполнил", records: "Записей", failure: "Не удалось выполнить действие.",
    hint: "Дата — фактическая дата нажатия. Установка, снятие и корректировки отметки сохраняются отдельными записями.",
    errors: { INVALID_CLIENT: "Выберите ребёнка заново.", INVALID_SPECIALIST: "Выберите специалиста заново.", MIGRATION_REQUIRED: "Необходимо выполнить миграцию базы данных.", INVALID_DATE_RANGE: "Введите корректный период.",
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
  const deleting = item.mode === "delete";
  const [form, setForm] = useState({ date: item.journalDate, clientId: String(item.clientId || ""), specialistId: String(item.specialistId || "") });
  const [options, setOptions] = useState({ clients: [], specialists: [] });
  const [loading, setLoading] = useState(!deleting);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    if (deleting) return;
    const controller = new AbortController();
    request("/options", { signal: controller.signal }).then((data) => { if (!controller.signal.aborted) setOptions(data); })
      .catch(() => { if (!controller.signal.aborted) setLoadError(true); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [deleting]);
  return <CompactDialog title={deleting ? ui.remove : ui.edit} closeLabel={ui.close} busy={busy} onClose={onClose}>
    <form onSubmit={(event) => { event.preventDefault(); onConfirm(form); }}>
    {deleting ? <><p>{item.clientName} · {item.specialistName}</p><p>{ui.removeConfirm}</p></> : loading ? <p>{ui.loading}</p> : loadError ? <p role="alert" className="internal-lesson-error">{ui.failure}</p> : <div className="internal-lesson-editor-fields">
      <label className="field">{ui.date}<input type="date" required value={form.date} disabled={busy} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
      <div className="field"><span>{ui.child}</span><CustomSelect searchable value={form.clientId} disabled={busy} placeholder={ui.select}
        options={options.clients.map((client) => ({ value: String(client.id), label: `${client.name} (#${client.id})` }))} onChange={(value) => setForm({ ...form, clientId: value })} /></div>
      <div className="field"><span>{ui.specialist}</span><CustomSelect searchable value={form.specialistId} disabled={busy} placeholder={ui.select}
        options={options.specialists.map((specialist) => ({ value: String(specialist.id), label: `${specialist.name}${specialist.position ? ` — ${specialist.position}` : ""}` }))} onChange={(value) => setForm({ ...form, specialistId: value })} /></div>
    </div>}
    {error && <p className="internal-lesson-error" role="alert">{error}</p>}
    <div className="internal-lesson-editor-actions">
      <ActionIconButton type="submit" className="btn" disabled={busy || loading || loadError || (!deleting && (!form.clientId || !form.specialistId))} label={busy ? ui.loading : deleting ? ui.remove : ui.save} icon={deleting ? "remove" : "save"} />
    </div>
    </form>
  </CompactDialog>;
}

export default function InternalLessonJournalPanel({ access, onClose }) {
  const { language } = useI18n();
  const ui = TEXT[language] || TEXT.uz;
  const [draft, setDraft] = useState(() => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date()).map((part) => [part.type, part.value]));
    const today = `${parts.year}-${parts.month}-${parts.day}`;
    return { dateFrom: today, dateTo: today, child: "", specialist: "", position: "" };
  });
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterOptions, setFilterOptions] = useState({ child: [], specialist: [], position: [] });
  const [filterOptionsLoading, setFilterOptionsLoading] = useState(false);
  const [filterOptionsError, setFilterOptionsError] = useState(false);
  useEffect(() => {
    if (!filterOpen) return;
    const controller = new AbortController();
    setFilterOptionsLoading(true);
    setFilterOptionsError(false);
    request("/options", { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) setFilterOptions(data.filters || { child: [], specialist: [], position: [] });
    }).catch(() => { if (!controller.signal.aborted) setFilterOptionsError(true); })
      .finally(() => { if (!controller.signal.aborted) setFilterOptionsLoading(false); });
    return () => controller.abort();
  }, [filterOpen]);
  useEscapeKey(filterOpen, () => setFilterOpen(false));
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
        [ui.date, "ID", ui.child, ui.specialist, ui.position],
        ...data.items.map((item) => [
          new Date(`${item.journalDate}T12:00:00Z`).toLocaleDateString(language === "ru" ? "ru-RU" : "uz-UZ", { timeZone: "Asia/Tashkent" }),
          item.clientId || "", item.clientName, item.specialistName, item.positionName])
      ] }]);
    } catch (err) { setError(errorText(err.message)); }
    finally { setExporting(false); }
  }

  async function correct(form) {
    if (busy.current) return;
    busy.current = true;
    setCorrecting(true);
    setCorrectionError("");
    try {
      const deleting = target.mode === "delete";
      await request(`/${target.completionId}`, { method: deleting ? "DELETE" : "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: target.currentVersion, ...(deleting ? {} : { date: form.date, clientId: Number(form.clientId), specialistId: Number(form.specialistId) }) }) });
      setTarget(null);
      setRevision((value) => value + 1);
    } catch (err) { setCorrectionError(errorText(err.message)); }
    finally { setCorrecting(false); busy.current = false; }
  }

  return <section className="all-users-panel crm-compact-panel internal-journal-panel">
    <div className="all-users-head"><h3>{ui.title}</h3><div className="all-users-head-actions">
      <ActionIconButton label={ui.filter} icon="filter" className="header-btn" aria-expanded={filterOpen} aria-controls="journalFilters" onClick={() => { setDraft({ ...filters }); setFilterOpen(true); }}>
        {Object.values(filters).some(Boolean) && <span className="action-icon-dot" aria-hidden="true" />}
      </ActionIconButton>
      <ActionIconButton type="button" className="header-btn" disabled={exporting || loading || Boolean(error)} onClick={exportAll} label={exporting ? ui.loading : ui.excel} icon="export" />
      <ActionIconButton type="button" className="header-btn" disabled={loading} onClick={() => setRevision((value) => value + 1)} label={ui.refresh} icon="refresh" />
      <ActionIconButton type="button" className="header-btn panel-close-btn"  onClick={onClose} label={ui.close} icon="close" />
    </div></div>
    {filterOpen && typeof document !== "undefined" && createPortal(<>
      <button type="button" className="login-overlay stacked-modal-overlay finance-modal-overlay" aria-label={ui.close} onClick={() => setFilterOpen(false)} />
      <div id="journalFilters" role="dialog" aria-modal="true" aria-labelledby="journalFilterTitle" className="logout-confirm-modal all-users-edit-modal finance-modal journal-filter-modal">
      <div className="journal-filter-head"><h3 id="journalFilterTitle">{ui.filter}</h3><ActionIconButton type="button" className="header-btn" label={ui.close} icon="close" onClick={() => setFilterOpen(false)} /></div>
      <form className="auth-form" onSubmit={(event) => { event.preventDefault(); setPage(1); setFilters({ ...draft }); setFilterOpen(false); }}>
      <div className="all-users-edit-fields settings-filter-grid journal-filter-grid">
      <div className="journal-filter-date-row"><label className="field">{ui.from}<input type="date" value={draft.dateFrom} max={draft.dateTo || undefined} onChange={(e) => { setDraft({ ...draft, dateFrom: e.target.value }); }} /></label>
      <label className="field">{ui.to}<input type="date" value={draft.dateTo} min={draft.dateFrom || undefined} onChange={(e) => { setDraft({ ...draft, dateTo: e.target.value }); }} /></label></div>
      {["child", "specialist", "position"].map((key) => <div className="field" key={key}><span>{ui[key]}</span>
        <CustomSelect value={draft[key]} options={[{ value: "", label: ui.all },
          ...(draft[key] && !filterOptions[key].includes(draft[key]) ? [draft[key]] : []), ...filterOptions[key]]
          .map((value) => typeof value === "string" ? { value, label: value } : value)}
          placeholder={ui.all} searchable searchPlaceholder={ui.search} emptyText={filterOptionsLoading ? ui.loading : ui.empty}
          disabled={filterOptionsLoading || filterOptionsError} menuPortal onChange={(value) => setDraft({ ...draft, [key]: value })} />
      </div>)}
      {filterOptionsError && <p role="alert" className="internal-lesson-error">{ui.failure}</p>}
      </div><div className="edit-actions">
      <button type="submit" className="btn btn-primary" disabled={loading}>{ui.search}</button>
      </div>
    </form></div></>, document.body)}
    {error && <p role="alert" className="internal-lesson-error">{error}</p>}
    {loading ? <p role="status">{ui.loading}</p> : <>
      <div className="all-users-table-wrap"><table className="all-users-table">
        <colgroup>
          <col className="journal-col-date" /><col className="journal-col-id" /><col className="journal-col-child" /><col className="journal-col-specialist" />
          <col className="journal-col-position" /><col className="journal-col-actions" />
        </colgroup>
        <thead><tr><th>{ui.date}</th><th>ID</th><th>{ui.child}</th><th>{ui.specialist}</th><th>{ui.position}</th><th>{ui.action}</th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.id}>
          <td>{new Date(`${item.journalDate}T12:00:00Z`).toLocaleDateString(language === "ru" ? "ru-RU" : "uz-UZ", { timeZone: "Asia/Tashkent" })}</td>
          <td>{item.clientId || "—"}</td><td>{item.clientName}</td><td>{item.specialistName}</td><td>{item.positionName || "—"}</td>
          <td>
            {access.update && <div className="journal-row-actions">
              <ActionIconButton className="header-btn" onClick={() => { setCorrectionError(""); setTarget({ ...item, mode: "edit" }); }} label={ui.edit} icon="edit" />
              <ActionIconButton className="header-btn" onClick={() => { setCorrectionError(""); setTarget({ ...item, mode: "delete" }); }} label={ui.remove} icon="remove" />
            </div>}
          </td>
        </tr>)}</tbody>
      </table></div>
      {items.length === 0 && !error && <p>{ui.empty}</p>}
      <div className="all-users-pagination">
        <ActionIconButton type="button" disabled={pagination.page <= 1} onClick={() => setPage(pagination.page - 1)} label={ui.previous} icon="previous" />
        <span>{pagination.page} / {pagination.totalPages} · {ui.records}: {pagination.total}</span>
        <ActionIconButton type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage(pagination.page + 1)} label={ui.next} icon="next" />
      </div>
    </>}
    {target && <CorrectionDialog item={target} ui={ui} busy={correcting} error={correctionError} onClose={() => setTarget(null)} onConfirm={correct} />}
  </section>;
}
