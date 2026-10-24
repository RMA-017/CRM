import { useState } from "react";
import CompactDialog from "../../../components/CompactDialog.jsx";
import CustomSelect from "../../../components/CustomSelect.jsx";
import ActionIconButton from "../../../components/ActionIconButton.jsx";

export default function InternalLessonBulkEditor({ bulk, options, ui, busy, error, onClose, onSave }) {
  const [specialistId, setSpecialistId] = useState("");
  const [dayChanges, setDayChanges] = useState({});
  const lessons = bulk.lessons || [];
  const days = [...new Set([...options.weekDays, ...lessons.flatMap((lesson) => lesson.weekDays)])].sort((a, b) => a - b);
  const deleting = bulk.kind === "bulkDelete";
  return <CompactDialog title={deleting ? ui.bulkDelete : ui.bulkEdit} closeLabel={ui.close} busy={busy} onClose={onClose}>
    <form onSubmit={(event) => { event.preventDefault(); onSave({ kind: bulk.kind, items: bulk.items,
      ...(!deleting && specialistId ? { specialistId: Number(specialistId) } : {}),
      ...(!deleting && Object.keys(dayChanges).length ? {
        addDays: days.filter((day) => dayChanges[day] === true), removeDays: days.filter((day) => dayChanges[day] === false)
      } : {}) }); }}>
      <p>{ui.selected}: {bulk.items.length}. {ui.allDaysNotice}</p>
      {!deleting && <>
        <div className="field"><span>{ui.specialist}</span><CustomSelect value={specialistId} onChange={setSpecialistId}
          disabled={busy} searchable menuPortal maxVisibleOptions={10} placeholder={ui.keepCurrent} searchPlaceholder={ui.search}
          options={[{ value: "", label: ui.keepCurrent }, ...options.specialists.filter((s) => s.isActive).map((s) => ({ value: String(s.id), label: s.name }))]} />
        </div>
        <fieldset className="internal-lesson-days" disabled={busy}><legend>{ui.days}</legend>
          {days.map((day) => {
            const count = lessons.filter((lesson) => lesson.weekDays.includes(day)).length;
            const changed = Object.hasOwn(dayChanges, day);
            const mixed = !changed && count > 0 && count < lessons.length;
            const checked = changed ? dayChanges[day] : count > 0 && count === lessons.length;
            return <label key={day} className={checked || mixed ? "is-selected" : ""}>
              <input type="checkbox" checked={checked} ref={(input) => { if (input) input.indeterminate = mixed; }}
                onChange={(event) => setDayChanges({ ...dayChanges, [day]: event.target.checked })} />
              {ui.dayNames[day]}{mixed && <small className="internal-lesson-mixed-days">{count}/{lessons.length}</small>}
            </label>;
          })}
        </fieldset>
      </>}
      {error && <p role="alert" className="internal-lesson-error">{error}</p>}
      <div className="internal-lesson-editor-actions"><ActionIconButton type="submit" className="btn" label={deleting ? ui.remove : ui.save}
        icon={deleting ? "remove" : "save"} disabled={busy || (!deleting && !specialistId && !Object.keys(dayChanges).length)} /></div>
    </form>
  </CompactDialog>;
}
