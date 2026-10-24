import { useState } from "react";
import CompactDialog from "../../../components/CompactDialog.jsx";
import CustomSelect from "../../../components/CustomSelect.jsx";
import ActionIconButton from "../../../components/ActionIconButton.jsx";
import { toggleInternalLessonDay } from "../internal-lessons.helpers.js";

export default function InternalLessonBulkEditor({ bulk, options, ui, busy, error, onClose, onSave }) {
  const [specialistId, setSpecialistId] = useState("");
  const [replaceDays, setReplaceDays] = useState(false);
  const [weekDays, setWeekDays] = useState([]);
  const deleting = bulk.kind === "bulkDelete";
  return <CompactDialog title={deleting ? ui.bulkDelete : ui.bulkEdit} closeLabel={ui.close} busy={busy} onClose={onClose}>
    <form onSubmit={(event) => { event.preventDefault(); onSave({ kind: bulk.kind, items: bulk.items,
      ...(!deleting && specialistId ? { specialistId: Number(specialistId) } : {}),
      ...(!deleting && replaceDays ? { weekDays } : {}) }); }}>
      <p>{ui.selected}: {bulk.items.length}. {ui.allDaysNotice}</p>
      {!deleting && <>
        <div className="field"><span>{ui.specialist}</span><CustomSelect value={specialistId} onChange={setSpecialistId}
          disabled={busy} searchable maxVisibleOptions={8} placeholder={ui.keepCurrent} searchPlaceholder={ui.search}
          options={[{ value: "", label: ui.keepCurrent }, ...options.specialists.filter((s) => s.isActive).map((s) => ({ value: String(s.id), label: s.name }))]} />
        </div>
        <label className="internal-lesson-replace-days"><input type="checkbox" disabled={busy} checked={replaceDays} onChange={(e) => setReplaceDays(e.target.checked)} />{ui.replaceDays}</label>
        {replaceDays && <fieldset className="internal-lesson-days" disabled={busy}><legend>{ui.days}</legend>
          {options.weekDays.map((day) => <label key={day} className={weekDays.includes(day) ? "is-selected" : ""}>
            <input type="checkbox" checked={weekDays.includes(day)} onChange={() => setWeekDays(toggleInternalLessonDay(weekDays, day))} />{ui.dayNames[day]}
          </label>)}
        </fieldset>}
      </>}
      {error && <p role="alert" className="internal-lesson-error">{error}</p>}
      <div className="internal-lesson-editor-actions"><ActionIconButton type="submit" className="btn" label={deleting ? ui.remove : ui.save}
        icon={deleting ? "remove" : "save"} disabled={busy || (!deleting && ((!specialistId && !replaceDays) || (replaceDays && !weekDays.length)))} /></div>
    </form>
  </CompactDialog>;
}
