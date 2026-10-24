import ActionIconButton from "../../../components/ActionIconButton.jsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CustomSelect from "../../../components/CustomSelect.jsx";
import InternalLessonBulkEditor from "./InternalLessonBulkEditor.jsx";
import { useI18n } from "../../../i18n/I18nProvider.jsx";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";
import { buildExportFilename, exportExcelWorkbook } from "../../../lib/excel-export.js";
import { changeInternalLessonFilter, getInternalLessonCards, getInternalLessonDaySummary, toggleInternalLessonDay } from "../internal-lessons.helpers.js";
import "../../../css/components/internal-lessons.css";

const TEXT = {
  uz: {
    selectMode: "Bir nechta darsni tanlash", selected: "Tanlangan darslar", selectAll: "Barchasini tanlash", clearSelection: "Tanlashni tugatish",
    bulkEdit: "Tanlangan darslarni o‘zgartirish", bulkDelete: "Tanlangan darslarni o‘chirish", keepCurrent: "O‘zgartirmaslik",
    allDaysNotice: "Tanlangan darslarning barcha hafta kunlariga ta’sir qiladi.", completedCount: "Joriy haftada bajarilgan / jami",
    dataChanged: "Jadval o‘zgargan. Yangilab, qayta urinib ko‘ring.", dayAlreadyAssigned: "Bu dars tanlangan kunda allaqachon bor. Qo‘shimcha darsni + orqali yarating.",
    pending: "Kutilmoqda", confirmed: "Tasdiqlangan",
    title: "Maktab-bog‘cha", subtitle: "Doimiy ichki dars jadvali", child: "Bola", specialist: "Mutaxassis",
    chooseChild: "Bolani tanlang", chooseSpecialist: "Mutaxassisni tanlang",
    search: "Qidirish...", noOptions: "Topilmadi",
    choose: "Jadvalni ochish uchun bola yoki mutaxassisni tanlang.", add: "Dars qo‘shish", edit: "Darsni o‘zgartirish",
    save: "Saqlash", remove: "Darsni o‘chirish", close: "Yopish", loading: "Yuklanmoqda...", retry: "Yangilash",
    days: "Hafta kunlari",
    emptyDays: "Barcha kunlar olib tashlangan. Saqlash bosilganda bu dars o‘chiriladi.",
    inactive: "Faol emas", closed: "Ish kuni emas",
    hidden: "Sozlamada yopilgan kunlardagi darslar", noDays: "Ish kunlari belgilanmagan.",
    failure: "Amalni bajarib bo‘lmadi.",
    dayNames: { 1: "Dushanba", 2: "Seshanba", 3: "Chorshanba", 4: "Payshanba", 5: "Juma", 6: "Shanba", 7: "Yakshanba" },
    errors: { INVALID_CLIENT: "Bolani Tarbiyachilar bo‘limidagi ro‘yxatdan tanlang.", INVALID_SPECIALIST: "Faol mutaxassisni tanlang.",
      INVALID_DAYS: "Kamida bitta hafta kunini belgilang.", CLOSED_DAY: "Tanlangan kun sozlamada ish kuni sifatida belgilanmagan.",
      LESSON_NOT_FOUND: "Dars topilmadi. Jadvalni yangilang.", MIGRATION_REQUIRED: "Ma’lumotlar bazasi migratsiyasini bajarish kerak.",
      DATA_CHANGED: "Ma’lumotlar o‘zgargan. Jadvalni yangilang.", "Forbidden.": "Bu amal uchun ruxsat yo‘q." }
  },
  ru: {
    selectMode: "Выбрать несколько занятий", selected: "Выбрано занятий", selectAll: "Выбрать все", clearSelection: "Завершить выбор",
    bulkEdit: "Изменить выбранные занятия", bulkDelete: "Удалить выбранные занятия", keepCurrent: "Не изменять",
    allDaysNotice: "Изменения затронут все дни недели выбранных занятий.", completedCount: "Выполнено за текущую неделю / всего",
    dataChanged: "Расписание изменилось. Обновите его и повторите попытку.", dayAlreadyAssigned: "Это занятие уже есть в выбранном дне. Дополнительное занятие можно создать через +.",
    pending: "Ожидается", confirmed: "Подтверждено",
    title: "Школа-садик", subtitle: "Постоянное расписание внутренних занятий", child: "Ребёнок", specialist: "Специалист",
    chooseChild: "Выберите ребёнка", chooseSpecialist: "Выберите специалиста",
    search: "Поиск...", noOptions: "Не найдено",
    choose: "Выберите ребёнка или специалиста, чтобы открыть расписание.", add: "Добавить занятие", edit: "Изменить занятие",
    save: "Сохранить", remove: "Удалить занятие", close: "Закрыть", loading: "Загрузка...", retry: "Обновить",
    days: "Дни недели",
    emptyDays: "Все дни сняты. При сохранении это занятие будет удалено.",
    inactive: "Неактивен", closed: "Нерабочий день",
    hidden: "Занятия в днях, закрытых в настройках", noDays: "Рабочие дни не указаны.",
    failure: "Не удалось выполнить действие.",
    dayNames: { 1: "Понедельник", 2: "Вторник", 3: "Среда", 4: "Четверг", 5: "Пятница", 6: "Суббота", 7: "Воскресенье" },
    errors: { INVALID_CLIENT: "Выберите ребёнка из списка раздела «Воспитатели».", INVALID_SPECIALIST: "Выберите активного специалиста.",
      INVALID_DAYS: "Выберите хотя бы один день недели.", CLOSED_DAY: "Выбранный день не указан как рабочий в настройках.",
      LESSON_NOT_FOUND: "Занятие не найдено. Обновите расписание.", MIGRATION_REQUIRED: "Необходимо выполнить миграцию базы данных.",
      DATA_CHANGED: "Данные изменились. Обновите расписание.", "Forbidden.": "Нет доступа для этого действия." }
  }
};

async function request(path, options = {}) {
  const response = await apiFetch(`/api/internal-lessons${path}`, options);
  const data = await readApiResponseData(response);
  if (!response.ok) throw new Error(data?.message || "Request failed");
  return data;
}

function LessonEditor({ form, setForm, options, ui, access, saving, error, onSave, onDelete, onClose }) {
  const dialogRef = useRef(null);
  const titleId = "internalLessonEditorTitle";
  useEffect(() => { dialogRef.current?.showModal(); }, []);
  const editable = form.id ? access.update : access.create;
  const days = [...new Set([...options.weekDays, ...form.originalDays])].sort((a, b) => a - b);
  const specialistOptions = options.specialists.filter((s) => s.isActive || s.id === Number(form.specialistId));
  return createPortal(
    <dialog className="internal-lesson-dialog" ref={dialogRef} aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); if (!saving) onClose(); }}>
      <form onSubmit={onSave}>
        <div className="all-users-head"><h3 id={titleId}>{form.id ? ui.edit : ui.add}</h3>
          <ActionIconButton type="button" className="header-btn panel-close-btn" disabled={saving}  onClick={onClose} label={ui.close} icon="close" />
        </div>
        {error && <p role="alert" className="internal-lesson-error">{error}</p>}
        <div className="internal-lesson-editor-fields">
          {form.fixedField !== "clientId" && <div className="field"><span id="internalLessonClientLabel">{ui.child}</span>
            <CustomSelect value={form.clientId} onChange={(value) => setForm({ ...form, clientId: value })}
              options={options.clients.map((c) => ({ value: String(c.id), label: `${c.name} (#${c.id})` }))}
              placeholder={ui.chooseChild} searchable searchPlaceholder={ui.search} emptyText={ui.noOptions}
              disabled={saving || !editable} />
          </div>}
          {form.fixedField !== "specialistId" && <div className="field"><span>{ui.specialist}</span>
            <CustomSelect value={form.specialistId} onChange={(value) => setForm({ ...form, specialistId: value })}
              options={specialistOptions.map((s) => ({ value: String(s.id), label: `${s.name}${s.isActive ? "" : ` (${ui.inactive})`}` }))}
              placeholder={ui.chooseSpecialist} searchable searchPlaceholder={ui.search} emptyText={ui.noOptions}
              disabled={saving || !editable} />
          </div>}
        </div>
        <fieldset className="internal-lesson-days" disabled={saving || !editable}><legend>{ui.days}</legend>
          {days.map((day) => <label key={day} className={form.weekDays.includes(day) ? "is-selected" : ""}>
            <input type="checkbox" checked={form.weekDays.includes(day)}
              onChange={() => setForm({ ...form, weekDays: toggleInternalLessonDay(form.weekDays, day) })} />
            {ui.dayNames[day]}{options.weekDays.includes(day) ? "" : ` (${ui.closed})`}
          </label>)}
        </fieldset>
        {form.id && form.weekDays.length === 0 && <p role="status" className="internal-lesson-error">{ui.emptyDays}</p>}
        <div className="internal-lesson-editor-actions">
          {form.id && form.weekDays.length > 0 && access.delete && <ActionIconButton type="button" className="header-btn internal-lesson-delete" disabled={saving}
            onClick={onDelete} label={ui.remove} icon="remove" />}
          <ActionIconButton type="submit" className="btn" disabled={saving || (form.id && !form.weekDays.length ? !access.delete : !editable)} label={saving ? ui.loading : form.id && !form.weekDays.length ? ui.remove : ui.save} icon={form.id && !form.weekDays.length ? "remove" : "save"} />
        </div>
      </form>
    </dialog>, document.body
  );
}

export default function InternalLessonsPanel({ access, onClose }) {
  const { language } = useI18n();
  const ui = TEXT[language] || TEXT.uz;
  const [options, setOptions] = useState({ clients: [], specialists: [], weekDays: [] });
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState("");
  const [filter, setFilter] = useState({ clientId: "", specialistId: "", mode: "client" });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [actionError, setActionError] = useState("");
  const [revision, setRevision] = useState(0);
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState([]);
  const [bulk, setBulk] = useState(null);
  const [dragOverDay, setDragOverDay] = useState(null);
  const drag = useRef(null);
  const suppressClickUntil = useRef(0);
  const [exporting, setExporting] = useState(false);
  async function exportAll() {
    setExporting(true);
    try {
      const data = await request("/export");
      exportExcelWorkbook(buildExportFilename("school-kindergarten"), [{ name: ui.title, rows: [
        ["ID", ui.child, ui.specialist, ...[1, 2, 3, 4, 5, 6, 7].map((day) => ui.dayNames[day])],
        ...data.items.map((item) => [item.clientId, item.clientName,
          `${item.specialistName}${item.positionName ? `-${item.positionName}` : ""}`,
          ...[1, 2, 3, 4, 5, 6, 7].map((day) => item.weekDays.includes(day) ? 1 : "")])
      ] }]);
    } catch (err) { setListError(ui.errors[err.message] || ui.failure); }
    finally { setExporting(false); }
  }
  const busyRef = useRef(false);
  const errorText = useCallback((message) => message === "DATA_CHANGED" ? ui.dataChanged : message === "DAY_ALREADY_ASSIGNED" ? ui.dayAlreadyAssigned : ui.errors[message] || ui.failure, [ui]);

  useEffect(() => {
    const controller = new AbortController();
    setOptionsLoading(true);
    setOptionsError("");
    request("/options", { signal: controller.signal }).then((data) => {
      if (controller.signal.aborted) return;
      setOptions(data);
      setFilter((current) => ({ ...current,
        clientId: data.clients.some((c) => String(c.id) === current.clientId) ? current.clientId : "",
        specialistId: data.specialists.some((s) => String(s.id) === current.specialistId) ? current.specialistId : ""
      }));
    }).catch((err) => { if (!controller.signal.aborted) setOptionsError(errorText(err.message)); })
      .finally(() => { if (!controller.signal.aborted) setOptionsLoading(false); });
    return () => controller.abort();
  }, [revision, errorText]);

  useEffect(() => {
    const controller = new AbortController();
    setItems([]);
    setListError("");
    if (!filter.clientId && !filter.specialistId) { setLoading(false); return () => controller.abort(); }
    setLoading(true);
    const params = new URLSearchParams();
    if (filter.clientId) params.set("clientId", filter.clientId);
    if (filter.specialistId) params.set("specialistId", filter.specialistId);
    request(`/?${params}`, { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) setItems(data.items);
    }).catch((err) => { if (!controller.signal.aborted) setListError(errorText(err.message)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filter.clientId, filter.specialistId, revision, errorText]);

  const specialistMode = filter.mode === "specialist" && Boolean(filter.specialistId);
  const hasSelection = Boolean(filter.clientId || filter.specialistId);
  const hiddenLessons = useMemo(() => items.filter((item) => item.weekDays.some((day) => !options.weekDays.includes(day))), [items, options.weekDays]);

  function changeFilter(field, value) {
    setActionError("");
    setSelected([]); setSelectionMode(false); drag.current = null; setDragOverDay(null);
    setItems([]);
    setLoading(Boolean(value || (field === "clientId" ? filter.specialistId : filter.clientId)));
    setFilter((current) => changeInternalLessonFilter(current, field, value));
  }

  function openEditor(day, item = null) {
    if (!item && !access.create) return;
    setFormError("");
    setForm({ id: item?.id || null, revision: item?.revision, clientId: String(item?.clientId || filter.clientId || ""),
      specialistId: String(item?.specialistId || filter.specialistId || ""),
      fixedField: filter.clientId ? "clientId" : "specialistId",
      weekDays: item ? [...item.weekDays] : [], originalDays: item ? [...item.weekDays] : [] });
  }

  async function save(event, forceDelete = false) {
    event.preventDefault();
    if (busyRef.current) return;
    const deleting = form.id && (forceDelete || form.weekDays.length === 0);
    if (deleting && !access.delete) return;
    if (!deleting && (!form.clientId || !form.specialistId || !form.weekDays.length)) {
      setFormError(errorText(!form.clientId ? "INVALID_CLIENT" : !form.specialistId ? "INVALID_SPECIALIST" : "INVALID_DAYS")); return;
    }
    busyRef.current = true;
    setSaving(true);
    setFormError("");
    try {
      const kind = deleting ? "delete" : form.id ? "update" : "create";
      await request("/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind,
        ...(form.id ? { items: [{ id: form.id, revision: form.revision }] } : {}),
        ...(!deleting ? { input: { clientId: Number(form.clientId), specialistId: Number(form.specialistId), weekDays: form.weekDays } } : {}) }) });
      setSelected([]);
      setForm(null);
      setRevision((value) => value + 1);
    } catch (err) { setFormError(errorText(err.message)); }
    finally { busyRef.current = false; setSaving(false); }
  }

  async function runAction(action) {
    if (busyRef.current) return;
    busyRef.current = true; setSaving(true); setFormError(""); setActionError("");
    try {
      await request("/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
      setSelected([]); setBulk(null); setSelectionMode(false); setRevision((value) => value + 1);
    } catch (error) { if (bulk) setFormError(errorText(error.message)); else setActionError(errorText(error.message)); }
    finally { busyRef.current = false; setSaving(false); }
  }

  function openBulk(kind) {
    setFormError("");
    const lessons = items.filter((item) => selected.includes(item.id));
    setBulk({ kind, items: lessons.map((item) => ({ id: item.id, revision: item.revision })),
      lessons: lessons.map((item) => ({ weekDays: [...item.weekDays] })) });
  }

  function dropLesson(event, day) {
    event.preventDefault(); event.stopPropagation(); setDragOverDay(null);
    const source = drag.current; drag.current = null;
    if (!source || source.day === day || !access.update || loading || saving || selectionMode) return;
    suppressClickUntil.current = Date.now() + 300;
    void runAction({ kind: "move", items: [{ id: source.id, revision: source.revision }], fromDay: source.day, toDay: day });
  }

  function renderCard(item, index, day) {
    return item ? <button type="button" key={item.id} className={`internal-lesson-card ${item.completionByDay?.[day] ? "is-confirmed" : "is-pending"} ${selectionMode && selected.includes(item.id) ? "is-selected" : ""}`}
      disabled={saving} draggable={access.update && !saving && !selectionMode}
      aria-pressed={selectionMode ? selected.includes(item.id) : undefined}
      onDragStart={(event) => { drag.current = { id: item.id, revision: item.revision, day }; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(item.id)); }}
      onDragEnd={() => { drag.current = null; setDragOverDay(null); suppressClickUntil.current = Date.now() + 300; }}
      aria-label={`${ui.edit}: ${item.clientName}, ${item.specialistName}, ${ui.dayNames[day]}, ${item.completionByDay?.[day] ? ui.confirmed : ui.pending}`}
      onClick={() => { if (Date.now() < suppressClickUntil.current) return;
        if (selectionMode) setSelected((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]);
        else openEditor(day, item); }}>
      <strong title={specialistMode ? item.clientName : item.specialistName}>{specialistMode ? item.clientName : item.specialistName}</strong>
    </button> : <button type="button" key={`empty-${index}`} className="internal-lesson-card is-empty"
      disabled={!access.create} aria-label={`${ui.add}: ${ui.dayNames[day]}, ${index + 1}`}
      onClick={() => openEditor(day)}><span aria-hidden="true">+</span></button>;
  }

  return <section className="all-users-panel crm-compact-panel internal-lessons-panel">
    <div className="all-users-head"><div className="internal-lesson-heading"><h3>{ui.title}</h3><p className="internal-lesson-hint">{ui.subtitle}</p></div>

    <div className="internal-lesson-filters">
      <div className="field"><span>{ui.child}</span>
        <CustomSelect value={filter.clientId} onChange={(value) => changeFilter("clientId", value)}
          maxVisibleOptions={12}
          options={options.clients.map((c) => ({ value: String(c.id), label: `${c.name} (#${c.id})` }))}
          placeholder={ui.chooseChild} disabled={optionsLoading || Boolean(optionsError)} searchable searchPlaceholder={ui.search} emptyText={ui.noOptions} />
      </div>
      <div className="field"><span>{ui.specialist}</span>
        <CustomSelect value={filter.specialistId} onChange={(value) => changeFilter("specialistId", value)}
          maxVisibleOptions={12}
          options={options.specialists.map((s) => ({ value: String(s.id), label: `${s.name}${s.isActive ? "" : ` (${ui.inactive})`}` }))}
          placeholder={ui.chooseSpecialist} disabled={optionsLoading || Boolean(optionsError)} searchable searchPlaceholder={ui.search} emptyText={ui.noOptions} />
      </div>
    </div>
      <div className="all-users-head-actions">
        {hasSelection && (access.update || access.delete) && <ActionIconButton className="header-btn" label={selectionMode ? ui.clearSelection : ui.selectMode} icon={selectionMode ? "close" : "check"}
          disabled={saving || loading} aria-pressed={selectionMode} onClick={() => { setSelectionMode((value) => !value); setSelected([]); }} />}
        <ActionIconButton type="button" className="header-btn internal-lesson-export" disabled={exporting} onClick={exportAll} label={exporting ? ui.loading : language === "ru" ? "Экспорт всех данных в Excel" : "Barchasini Excel’ga eksport"} icon="export" />
        <ActionIconButton type="button" className="header-btn" disabled={loading || optionsLoading || saving} onClick={() => { setSelected([]); setRevision((value) => value + 1); }} label={ui.retry} icon="refresh" />
        <ActionIconButton type="button" className="header-btn panel-close-btn"  onClick={onClose} label={ui.close} icon="close" />
      </div>
    </div>
    {selectionMode && <div className="internal-lesson-bulk-toolbar">
      <span>{ui.selected}: {selected.length}</span>
      <ActionIconButton className="header-btn" label={ui.selectAll} icon="check" disabled={saving || loading} onClick={() => setSelected(items.map((item) => item.id))} />
      {access.update && <ActionIconButton className="header-btn" label={ui.bulkEdit} icon="edit" disabled={saving || !selected.length} onClick={() => openBulk("bulkUpdate")} />}
      {access.delete && <ActionIconButton className="header-btn" label={ui.bulkDelete} icon="remove" disabled={saving || !selected.length} onClick={() => openBulk("bulkDelete")} />}
      <small>{ui.allDaysNotice}</small>
    </div>}
    {(optionsError || listError) && <p role="alert" className="internal-lesson-error">{optionsError || listError}</p>}
    {actionError && <p role="alert" className="internal-lesson-error">{actionError}</p>}
    {optionsLoading ? <p role="status">{ui.loading}</p> : optionsError ? null : <>
      {!hasSelection ? <p className="all-users-state">{ui.choose}</p> : loading ? <p role="status">{ui.loading}</p> : !listError && <>
        <div className="internal-lesson-grid-scroll"><div className="internal-lesson-grid" style={{ "--internal-days": Math.max(1, options.weekDays.length) }}>
          {options.weekDays.map((day) => <section key={day} className={`internal-lesson-day ${dragOverDay === day ? "is-drop-target" : ""}`} aria-label={ui.dayNames[day]}
            onDragOverCapture={(event) => { if (drag.current && access.update && !selectionMode) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverDay(day); } }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragOverDay(null); }} onDropCapture={(event) => dropLesson(event, day)}>
            <h4>{ui.dayNames[day]} <span className="internal-lesson-day-count"
              aria-label={ui.completedCount} title={ui.completedCount}>
              {getInternalLessonDaySummary(items, day).completed}/{getInternalLessonDaySummary(items, day).total}
            </span></h4>
            <div className="internal-lesson-slots">{getInternalLessonCards(items, day).map((item, index) => renderCard(item, index, day))}</div>
            <ActionIconButton label={ui.add} icon="add" className="internal-lesson-add" disabled={!access.create} onClick={() => openEditor(day)} />
          </section>)}
        </div></div>
        {!options.weekDays.length && <p>{ui.noDays}</p>}
        {hiddenLessons.length > 0 && <details className="internal-lesson-hidden"><summary>{ui.hidden} ({hiddenLessons.length})</summary>
          {hiddenLessons.map((item) => <button type="button" className="header-btn" key={item.id} onClick={() => openEditor(item.weekDays[0], item)}>
            {item.clientName} · {item.specialistName} · {item.weekDays.filter((day) => !options.weekDays.includes(day)).map((day) => ui.dayNames[day]).join(", ")}
          </button>)}
        </details>}
      </>}
    </>}
    {form && <LessonEditor form={form} setForm={setForm} options={options} ui={ui} access={access} saving={saving} error={formError}
      onSave={save} onDelete={(event) => save(event, true)}
      onClose={() => setForm(null)} />}
    {bulk && <InternalLessonBulkEditor bulk={bulk} options={options} ui={ui} busy={saving} error={formError}
      onSave={runAction} onClose={() => { setBulk(null); setFormError(""); }} />}
  </section>;
}
