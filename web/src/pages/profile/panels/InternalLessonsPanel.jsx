import ActionIconButton from "../../../components/ActionIconButton.jsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CustomSelect from "../../../components/CustomSelect.jsx";
import { useI18n } from "../../../i18n/I18nProvider.jsx";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";
import { buildExportFilename, exportExcelWorkbook } from "../../../lib/excel-export.js";
import { changeInternalLessonFilter, getInternalLessonCards, toggleInternalLessonDay } from "../internal-lessons.helpers.js";
import "../../../css/components/internal-lessons.css";

const TEXT = {
  uz: {
    pending: "Kutilmoqda", confirmed: "Tasdiqlangan",
    title: "Maktab-bog‘cha", subtitle: "Doimiy ichki dars jadvali", child: "Bola", specialist: "Mutaxassis",
    chooseChild: "Bolani tanlang", chooseSpecialist: "Mutaxassisni tanlang", allChildren: "Barcha bolalar", allSpecialists: "Barcha mutaxassislar",
    search: "Qidirish...", noOptions: "Topilmadi", noChildren: "Avval Tarbiyachilar bo‘limidagi ro‘yxatga bolani qo‘shing.",
    choose: "Jadvalni ochish uchun bola yoki mutaxassisni tanlang.", add: "Dars qo‘shish", edit: "Darsni o‘zgartirish",
    save: "Saqlash", remove: "Darsni o‘chirish", cancel: "Bekor qilish", close: "Yopish", loading: "Yuklanmoqda...", retry: "Yangilash",
    days: "Hafta kunlari", daysHint: "Kun belgisini olib tashlash o‘sha kundagi darsni olib tashlaydi. Barcha belgilar olib tashlansa, dars o‘chadi.",
    emptyDays: "Barcha kunlar olib tashlangan. Saqlash bosilganda bu dars o‘chiriladi.",
    caregiver: "Tarbiyachi", unassigned: "Biriktirilmagan", inactive: "Faol emas", closed: "Ish kuni emas",
    hidden: "Sozlamada yopilgan kunlardagi darslar", noDays: "Ish kunlari belgilanmagan.",
    childView: "Bolaning darslari", specialistView: "Mutaxassisning darslari", failure: "Amalni bajarib bo‘lmadi.",
    dayNames: { 1: "Dushanba", 2: "Seshanba", 3: "Chorshanba", 4: "Payshanba", 5: "Juma", 6: "Shanba", 7: "Yakshanba" },
    errors: { INVALID_CLIENT: "Bolani Tarbiyachilar bo‘limidagi ro‘yxatdan tanlang.", INVALID_SPECIALIST: "Faol mutaxassisni tanlang.",
      INVALID_DAYS: "Kamida bitta hafta kunini belgilang.", CLOSED_DAY: "Tanlangan kun sozlamada ish kuni sifatida belgilanmagan.",
      LESSON_NOT_FOUND: "Dars topilmadi. Jadvalni yangilang.", MIGRATION_REQUIRED: "Ma’lumotlar bazasi migratsiyasini bajarish kerak.",
      DATA_CHANGED: "Ma’lumotlar o‘zgargan. Jadvalni yangilang.", "Forbidden.": "Bu amal uchun ruxsat yo‘q." }
  },
  ru: {
    pending: "Ожидается", confirmed: "Подтверждено",
    title: "Школа-садик", subtitle: "Постоянное расписание внутренних занятий", child: "Ребёнок", specialist: "Специалист",
    chooseChild: "Выберите ребёнка", chooseSpecialist: "Выберите специалиста", allChildren: "Все дети", allSpecialists: "Все специалисты",
    search: "Поиск...", noOptions: "Не найдено", noChildren: "Сначала добавьте ребёнка в список раздела «Воспитатели».",
    choose: "Выберите ребёнка или специалиста, чтобы открыть расписание.", add: "Добавить занятие", edit: "Изменить занятие",
    save: "Сохранить", remove: "Удалить занятие", cancel: "Отмена", close: "Закрыть", loading: "Загрузка...", retry: "Обновить",
    days: "Дни недели", daysHint: "Снимите отметку дня, чтобы убрать занятие в этот день. Если снять все отметки, занятие будет удалено.",
    emptyDays: "Все дни сняты. При сохранении это занятие будет удалено.",
    caregiver: "Воспитатель", unassigned: "Не закреплён", inactive: "Неактивен", closed: "Нерабочий день",
    hidden: "Занятия в днях, закрытых в настройках", noDays: "Рабочие дни не указаны.",
    childView: "Занятия ребёнка", specialistView: "Занятия специалиста", failure: "Не удалось выполнить действие.",
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

function LessonEditor({ form, setForm, options, ui, access, saving, error, onSave, onClose }) {
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
          <div className="field"><span id="internalLessonClientLabel">{ui.child}</span>
            <CustomSelect value={form.clientId} onChange={(value) => setForm({ ...form, clientId: value })}
              options={options.clients.map((c) => ({ value: String(c.id), label: `${c.name} (#${c.id})` }))}
              placeholder={ui.chooseChild} searchable searchPlaceholder={ui.search} emptyText={ui.noOptions}
              disabled={saving || !editable} />
          </div>
          <div className="field"><span>{ui.specialist}</span>
            <CustomSelect value={form.specialistId} onChange={(value) => setForm({ ...form, specialistId: value })}
              options={specialistOptions.map((s) => ({ value: String(s.id), label: `${s.name}${s.isActive ? "" : ` (${ui.inactive})`}` }))}
              placeholder={ui.chooseSpecialist} searchable searchPlaceholder={ui.search} emptyText={ui.noOptions}
              disabled={saving || !editable} />
          </div>
        </div>
        <fieldset className="internal-lesson-days" disabled={saving || !editable}><legend>{ui.days}</legend>
          {days.map((day) => <label key={day} className={form.weekDays.includes(day) ? "is-selected" : ""}>
            <input type="checkbox" checked={form.weekDays.includes(day)}
              onChange={() => setForm({ ...form, weekDays: toggleInternalLessonDay(form.weekDays, day) })} />
            {ui.dayNames[day]}{options.weekDays.includes(day) ? "" : ` (${ui.closed})`}
          </label>)}
        </fieldset>
        {form.id && <p className="internal-lesson-hint">{ui.daysHint}</p>}
        {form.id && form.weekDays.length === 0 && <p role="status" className="internal-lesson-error">{ui.emptyDays}</p>}
        <div className="internal-lesson-editor-actions">
          {form.id && access.delete && <ActionIconButton type="button" className="header-btn internal-lesson-delete" disabled={saving}
            onClick={() => setForm({ ...form, weekDays: [] })} label={ui.remove} icon="remove" />}
          <ActionIconButton type="button" className="header-btn" disabled={saving} onClick={onClose} label={ui.cancel} icon="close" />
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
  const [revision, setRevision] = useState(0);
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  async function exportAll() {
    setExporting(true);
    try {
      const data = await request("/export");
      exportExcelWorkbook(buildExportFilename("school-kindergarten"), [{ name: ui.title, rows: [
        ["ID", ui.child, ui.specialist, ui.days],
        ...data.items.map((item) => [item.id, item.clientName, item.specialistName, item.weekDays.map((day) => ui.dayNames[day]).join(", ")])
      ] }]);
    } catch (err) { setListError(ui.errors[err.message] || ui.failure); }
    finally { setExporting(false); }
  }
  const busyRef = useRef(false);
  const errorText = useCallback((message) => ui.errors[message] || ui.failure, [ui]);

  useEffect(() => {
    function refresh() { setRevision((value) => value + 1); }
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

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
    if (!filter.clientId && !filter.specialistId) return;
    const controller = new AbortController();
    let inFlight = false;
    const params = new URLSearchParams();
    if (filter.clientId) params.set("clientId", filter.clientId);
    if (filter.specialistId) params.set("specialistId", filter.specialistId);
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible" || inFlight) return;
      inFlight = true;
      try {
        const data = await request(`/?${params}`, { signal: controller.signal });
        if (!controller.signal.aborted) setItems(data.items);
      } catch { /* Keep the displayed schedule on a temporary background refresh failure. */ }
      finally { inFlight = false; }
    }, 20000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [filter.clientId, filter.specialistId]);

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

  const selectedChild = options.clients.find((c) => String(c.id) === filter.clientId);
  const selectedSpecialist = options.specialists.find((s) => String(s.id) === filter.specialistId);
  const specialistMode = filter.mode === "specialist" && Boolean(filter.specialistId);
  const hasSelection = Boolean(filter.clientId || filter.specialistId);
  const hiddenLessons = useMemo(() => items.filter((item) => item.weekDays.some((day) => !options.weekDays.includes(day))), [items, options.weekDays]);

  function changeFilter(field, value) {
    setItems([]);
    setLoading(Boolean(value || (field === "clientId" ? filter.specialistId : filter.clientId)));
    setFilter((current) => changeInternalLessonFilter(current, field, value));
  }

  function openEditor(day, item = null) {
    if (!item && !access.create) return;
    setFormError("");
    setForm({ id: item?.id || null, clientId: String(item?.clientId || filter.clientId || ""),
      specialistId: String(item?.specialistId || filter.specialistId || ""),
      weekDays: item ? [...item.weekDays] : [day], originalDays: item ? [...item.weekDays] : [] });
  }

  async function save(event) {
    event.preventDefault();
    if (busyRef.current) return;
    const deleting = form.id && form.weekDays.length === 0;
    if (!deleting && (!form.clientId || !form.specialistId || !form.weekDays.length)) {
      setFormError(errorText(!form.clientId ? "INVALID_CLIENT" : !form.specialistId ? "INVALID_SPECIALIST" : "INVALID_DAYS")); return;
    }
    busyRef.current = true;
    setSaving(true);
    setFormError("");
    try {
      await request(form.id ? `/${form.id}` : "/", {
        method: form.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: Number(form.clientId), specialistId: Number(form.specialistId), weekDays: form.weekDays })
      });
      setForm(null);
      setRevision((value) => value + 1);
    } catch (err) { setFormError(errorText(err.message)); }
    finally { busyRef.current = false; setSaving(false); }
  }

  function renderCard(item, index, day) {
    return item ? <button type="button" key={item.id} className={`internal-lesson-card ${item.completionByDay?.[day] ? "is-confirmed" : "is-pending"}`}
      aria-label={`${ui.edit}: ${item.clientName}, ${item.specialistName}, ${ui.dayNames[day]}, ${item.completionByDay?.[day] ? ui.confirmed : ui.pending}`}
      onClick={() => openEditor(day, item)}>
      <strong title={specialistMode ? item.clientName : item.specialistName}>{specialistMode ? item.clientName : item.specialistName}</strong>
      <span title={item.positionName}>{item.positionName || "—"}</span>
    </button> : <button type="button" key={`empty-${index}`} className="internal-lesson-card is-empty"
      disabled={!access.create} aria-label={`${ui.add}: ${ui.dayNames[day]}, ${index + 1}`}
      onClick={() => openEditor(day)}><span aria-hidden="true">+</span></button>;
  }

  return <section className="all-users-panel crm-compact-panel internal-lessons-panel">
    <div className="all-users-head"><div><h3>{ui.title}</h3><p className="internal-lesson-hint">{ui.subtitle}</p></div>

    <div className="internal-lesson-filters">
      <div className="field"><span>{ui.child}</span>
        <CustomSelect value={filter.clientId} onChange={(value) => changeFilter("clientId", value)}
          options={[{ value: "", label: filter.specialistId ? ui.allChildren : ui.chooseChild }, ...options.clients.map((c) => ({ value: String(c.id), label: `${c.name} (#${c.id})` }))]}
          placeholder={ui.chooseChild} disabled={optionsLoading || Boolean(optionsError)} searchable searchPlaceholder={ui.search} emptyText={ui.noOptions} />
      </div>
      <div className="field"><span>{ui.specialist}</span>
        <CustomSelect value={filter.specialistId} onChange={(value) => changeFilter("specialistId", value)}
          options={[{ value: "", label: filter.clientId ? ui.allSpecialists : ui.chooseSpecialist }, ...options.specialists.map((s) => ({ value: String(s.id), label: `${s.name}${s.isActive ? "" : ` (${ui.inactive})`}` }))]}
          placeholder={ui.chooseSpecialist} disabled={optionsLoading || Boolean(optionsError)} searchable searchPlaceholder={ui.search} emptyText={ui.noOptions} />
      </div>
    </div>
      <div className="all-users-head-actions">
        <ActionIconButton type="button" className="header-btn" disabled={exporting} onClick={exportAll} label={exporting ? ui.loading : language === "ru" ? "Экспорт всех данных в Excel" : "Barchasini Excel’ga eksport"} icon="export" />
        <ActionIconButton type="button" className="header-btn" disabled={loading || optionsLoading} onClick={() => setRevision((value) => value + 1)} label={ui.retry} icon="refresh" />
        <ActionIconButton type="button" className="header-btn panel-close-btn"  onClick={onClose} label={ui.close} icon="close" />
      </div>
    </div>
    {(optionsError || listError) && <p role="alert" className="internal-lesson-error">{optionsError || listError}</p>}
    {optionsLoading ? <p role="status">{ui.loading}</p> : optionsError ? null : <>
      {options.clients.length === 0 && <p>{ui.noChildren}</p>}
      {!hasSelection ? <p className="all-users-state">{ui.choose}</p> : loading ? <p role="status">{ui.loading}</p> : !listError && <>
        <h4>{specialistMode ? ui.specialistView : ui.childView}: {specialistMode ? selectedSpecialist?.name : selectedChild?.name}</h4>
        <div className="internal-lesson-grid-scroll"><div className="internal-lesson-grid" style={{ "--internal-days": Math.max(1, options.weekDays.length) }}>
          {options.weekDays.map((day) => <section key={day} className="internal-lesson-day" aria-label={ui.dayNames[day]}>
            <h4>{ui.dayNames[day]}</h4>
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
      onSave={save} onClose={() => setForm(null)} />}
  </section>;
}
