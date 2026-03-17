import { createPortal } from "react-dom";
import CustomSelect from "../../../components/CustomSelect.jsx";

const VIP_DAY_CHIPS = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
  { value: "7", label: "Sunday" }
];

function VipAssignmentModals({
  vipDailyRoutineEditModal,
  closeVipDailyRoutineEditModal,
  handleVipDailyRoutineSave,
  vipDailyRoutineClassOptions,
  vipDailyRoutineActivityOptions,
  setVipDailyRoutineEditModal,
  vipDailyRoutineNoteMaxLength,
  vipDailyRoutineEditSaving,
  vipDailyRoutineDeleteModal,
  vipDailyRoutineDeleteSaving,
  confirmVipDailyRoutineDelete,
  closeVipDailyRoutineDeleteModal,
  vipClassAddModalOpen,
  vipClassModalMode,
  closeVipClassAddModal,
  handleVipClassSave,
  vipClassDraft,
  setVipClassDraft,
  vipClassFormError,
  setVipClassFormError,
  vipClassTeacherOptions,
  vipClassModalSaving,
  vipClassDeleteModal,
  vipClassDeleteSaving,
  confirmVipClassDelete,
  closeVipClassDeleteModal,
  vipTutorEditModal,
  closeVipTutorEditModal,
  handleVipTutorEditSave,
  vipAssignmentClassOptions,
  vipAssignmentTutorOptions,
  setVipTutorEditModal,
  vipTutorEditSaving
}) {
  if (typeof document === "undefined") {
    return null;
  }

  const vipDailyRoutineEditModalLayer = (
    <>
      <section
        id="vipDailyRoutineEditModal"
        className="logout-confirm-modal settings-edit-modal appointment-breaks-add-modal vip-class-add-modal"
        hidden={!vipDailyRoutineEditModal.open}
        aria-modal="true"
        role="dialog"
        aria-label={vipDailyRoutineEditModal.id ? "Edit VIP daily routine" : "Add VIP daily routine"}
      >
        <div className="appointment-breaks-add-modal-head">
          <h3>{vipDailyRoutineEditModal.id ? "Edit routine" : "Add routine"}</h3>
          <button
            id="closeVipDailyRoutineEditModalBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close routine modal"
            onClick={closeVipDailyRoutineEditModal}
          >
            ×
          </button>
        </div>

        <form
          className="appointment-breaks-add-modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleVipDailyRoutineSave();
          }}
        >
          <div className="vip-daily-routine-form-scroll">
            <div className="vip-class-add-grid">
              <div>
                <span>Class</span>
                <CustomSelect
                  id="vipDailyRoutineClassSelect"
                  placeholder="Select class"
                  value={String(vipDailyRoutineEditModal.classId || "")}
                  options={vipDailyRoutineClassOptions}
                  searchable
                  searchThreshold={8}
                  menuPortal
                  maxVisibleOptions={8}
                  onChange={(nextValue) => {
                    setVipDailyRoutineEditModal((prev) => ({
                      ...prev,
                      classId: String(nextValue || "").trim(),
                      error: ""
                    }));
                  }}
                />
              </div>
              <div>
                <span>Day</span>
                <div className="appointment-repeat-days" role="group" aria-label="Select day of week">
                  {VIP_DAY_CHIPS.map((day) => {
                    const isEditMode = Boolean(vipDailyRoutineEditModal.id);
                    const days = Array.isArray(vipDailyRoutineEditModal.dayOfWeek) ? vipDailyRoutineEditModal.dayOfWeek : [];
                    const checked = days.includes(day.value);
                    return (
                      <label
                        key={day.value}
                        className={`appointment-repeat-day-chip${checked ? " is-active" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setVipDailyRoutineEditModal((prev) => {
                              const prevDays = Array.isArray(prev.dayOfWeek) ? prev.dayOfWeek : [];
                              const nextDays = isEditMode
                                ? [day.value]
                                : prevDays.includes(day.value)
                                  ? prevDays.filter((d) => d !== day.value)
                                  : [...prevDays, day.value];
                              return { ...prev, dayOfWeek: nextDays, error: "" };
                            });
                          }}
                        />
                        <span>{day.label.slice(0, 3)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <span>Activity</span>
                <CustomSelect
                  id="vipDailyRoutineActivitySelect"
                  placeholder="Select activity"
                  value={String(vipDailyRoutineEditModal.activityType || "lesson")}
                  options={vipDailyRoutineActivityOptions}
                  menuPortal
                  onChange={(nextValue) => {
                    setVipDailyRoutineEditModal((prev) => ({
                      ...prev,
                      activityType: String(nextValue || "lesson"),
                      error: ""
                    }));
                  }}
                />
              </div>
              <div className="vip-daily-routine-time-row">
                <label htmlFor="vipDailyRoutineStartTimeInput">
                  <span>Start</span>
                  <input
                    id="vipDailyRoutineStartTimeInput"
                    type="time"
                    value={vipDailyRoutineEditModal.startTime}
                    onChange={(event) => {
                      const nextValue = String(event.currentTarget.value || "").trim();
                      setVipDailyRoutineEditModal((prev) => ({
                        ...prev,
                        startTime: nextValue,
                        error: ""
                      }));
                    }}
                  />
                </label>
                <label htmlFor="vipDailyRoutineEndTimeInput">
                  <span>End</span>
                  <input
                    id="vipDailyRoutineEndTimeInput"
                    type="time"
                    value={vipDailyRoutineEditModal.endTime}
                    onChange={(event) => {
                      const nextValue = String(event.currentTarget.value || "").trim();
                      setVipDailyRoutineEditModal((prev) => ({
                        ...prev,
                        endTime: nextValue,
                        error: ""
                      }));
                    }}
                  />
                </label>
              </div>
            </div>

            <label htmlFor="vipDailyRoutineNoteInput">
              <span>Note</span>
              <textarea
                id="vipDailyRoutineNoteInput"
                className="notify-textarea"
                value={vipDailyRoutineEditModal.note}
                maxLength={vipDailyRoutineNoteMaxLength}
                placeholder="Optional note"
                onChange={(event) => {
                  const nextValue = String(event.currentTarget.value || "").slice(0, vipDailyRoutineNoteMaxLength);
                  setVipDailyRoutineEditModal((prev) => ({
                    ...prev,
                    note: nextValue,
                    error: ""
                  }));
                }}
              />
            </label>
          </div>

          <div className="edit-actions appointment-breaks-add-modal-actions">
            <button
              id="saveVipDailyRoutineModalBtn"
              className="header-btn"
              type="submit"
              disabled={vipDailyRoutineEditSaving}
            >
              {vipDailyRoutineEditSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </section>
      <div
        className="login-overlay"
        hidden={!vipDailyRoutineEditModal.open}
        onClick={closeVipDailyRoutineEditModal}
      />
    </>
  );

  const vipDailyRoutineDeleteModalLayer = (
    <>
      <section
        id="vipDailyRoutineDeleteModal"
        className="logout-confirm-modal settings-edit-modal"
        hidden={!vipDailyRoutineDeleteModal.open}
        aria-modal="true"
        role="dialog"
        aria-label="Delete VIP routine confirmation"
      >
        <h3>Delete this routine?</h3>
        <p className="all-users-state">
          This action cannot be undone.
        </p>
        <div className="logout-confirm-actions">
          <button
            id="vipDailyRoutineDeleteConfirmBtn"
            type="button"
            className="table-action-btn table-action-btn-danger"
            disabled={vipDailyRoutineDeleteSaving}
            onClick={() => {
              void confirmVipDailyRoutineDelete();
            }}
          >
            {vipDailyRoutineDeleteSaving ? "Deleting..." : "Yes"}
          </button>
          <button
            id="vipDailyRoutineDeleteNoBtn"
            type="button"
            className="btn header-btn"
            disabled={vipDailyRoutineDeleteSaving}
            onClick={closeVipDailyRoutineDeleteModal}
          >
            No
          </button>
        </div>
      </section>
      <div
        className="login-overlay"
        hidden={!vipDailyRoutineDeleteModal.open}
        onClick={() => {
          if (!vipDailyRoutineDeleteSaving) {
            closeVipDailyRoutineDeleteModal();
          }
        }}
      />
    </>
  );

  const vipClassAddModalLayer = (
    <>
      <section
        id="vipClassAddModal"
        className="logout-confirm-modal settings-edit-modal appointment-breaks-add-modal vip-class-add-modal"
        hidden={!vipClassAddModalOpen}
        aria-modal="true"
        role="dialog"
        aria-label="Add class"
      >
        <div className="appointment-breaks-add-modal-head">
          <h3>{vipClassModalMode === "edit" ? "Edit class" : "Add class"}</h3>
          <button
            id="closeVipClassAddModalBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close add class modal"
            onClick={closeVipClassAddModal}
          >
            ×
          </button>
        </div>

        <form
          className="appointment-breaks-add-modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleVipClassSave();
          }}
        >
          <div className="vip-class-add-grid">
            <label htmlFor="vipClassModalNameInput">
              <span>Class name</span>
              <input
                id="vipClassModalNameInput"
                type="text"
                maxLength={64}
                placeholder="Class name"
                value={String(vipClassDraft?.className || "")}
                onChange={(event) => {
                  const nextValue = String(event.currentTarget.value || "");
                  setVipClassDraft((prev) => ({
                    ...prev,
                    className: nextValue
                  }));
                  if (vipClassFormError) {
                    setVipClassFormError("");
                  }
                }}
              />
            </label>

            <div>
              <span>Educator</span>
              <CustomSelect
                id="vipClassModalTeacherSelect"
                placeholder="Select educator"
                value={String(vipClassDraft?.teacherId || "")}
                options={vipClassTeacherOptions}
                searchable
                searchPlaceholder="Search educator..."
                searchThreshold={8}
                menuPortal
                maxVisibleOptions={6}
                onChange={(nextValue) => {
                  setVipClassDraft((prev) => ({
                    ...prev,
                    teacherId: String(nextValue || "")
                  }));
                  if (vipClassFormError) {
                    setVipClassFormError("");
                  }
                }}
              />
            </div>
          </div>

          <div className="edit-actions appointment-breaks-add-modal-actions">
            <button
              id="saveVipClassAddModalBtn"
              className="header-btn"
              type="submit"
              disabled={vipClassModalSaving}
            >
              {vipClassModalSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </section>
      <div
        className="login-overlay"
        hidden={!vipClassAddModalOpen}
        onClick={closeVipClassAddModal}
      />
    </>
  );

  const vipClassDeleteModalLayer = (
    <>
      <section
        id="vipClassDeleteModal"
        className="logout-confirm-modal settings-edit-modal"
        hidden={!vipClassDeleteModal.open}
        aria-modal="true"
        role="dialog"
        aria-label="Delete class confirmation"
      >
        <h3>Delete this class?</h3>
        <p className="all-users-state">
          {vipClassDeleteModal.className
            ? `Class: ${vipClassDeleteModal.className}`
            : "This action cannot be undone."}
        </p>
        <div className="logout-confirm-actions">
          <button
            id="vipClassDeleteConfirmBtn"
            type="button"
            className="table-action-btn table-action-btn-danger"
            disabled={vipClassDeleteSaving}
            onClick={() => {
              void confirmVipClassDelete();
            }}
          >
            {vipClassDeleteSaving ? "Deleting..." : "Yes"}
          </button>
          <button
            id="vipClassDeleteNoBtn"
            type="button"
            className="btn header-btn"
            disabled={vipClassDeleteSaving}
            onClick={closeVipClassDeleteModal}
          >
            No
          </button>
        </div>
      </section>
      <div
        className="login-overlay"
        hidden={!vipClassDeleteModal.open}
        onClick={() => {
          if (!vipClassDeleteSaving) {
            closeVipClassDeleteModal();
          }
        }}
      />
    </>
  );

  const vipTutorEditModalLayer = (
    <>
      <section
        id="vipTutorEditModal"
        className="logout-confirm-modal settings-edit-modal appointment-breaks-add-modal vip-class-add-modal"
        hidden={!vipTutorEditModal.open}
        aria-modal="true"
        role="dialog"
        aria-label="Edit tutor assignment"
      >
        <div className="appointment-breaks-add-modal-head">
          <h3>Edit tutor assignment</h3>
          <button
            id="closeVipTutorEditModalBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close tutor assignment modal"
            onClick={closeVipTutorEditModal}
          >
            ×
          </button>
        </div>

        <form
          className="appointment-breaks-add-modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleVipTutorEditSave();
          }}
        >
          <div className="vip-class-add-grid">
            <div>
              <span>Class</span>
              <CustomSelect
                id="vipTutorEditClassSelect"
                placeholder="Select class"
                value={String(vipTutorEditModal.classId || "")}
                options={vipAssignmentClassOptions}
                searchable
                searchThreshold={8}
                menuPortal
                maxVisibleOptions={6}
                onChange={(nextValue) => {
                  setVipTutorEditModal((prev) => ({
                    ...prev,
                    classId: String(nextValue || ""),
                    error: ""
                  }));
                }}
              />
            </div>

            <div>
              <span>Tutor</span>
              <CustomSelect
                id="vipTutorEditTutorSelect"
                placeholder="Select tutor"
                value={String(vipTutorEditModal.tutorId || "")}
                options={vipAssignmentTutorOptions}
                searchable
                searchThreshold={8}
                menuPortal
                maxVisibleOptions={6}
                onChange={(nextValue) => {
                  setVipTutorEditModal((prev) => ({
                    ...prev,
                    tutorId: String(nextValue || ""),
                    error: ""
                  }));
                }}
              />
            </div>
          </div>

          <div className="edit-actions appointment-breaks-add-modal-actions">
            <button
              id="saveVipTutorEditModalBtn"
              className="header-btn"
              type="submit"
              disabled={vipTutorEditSaving}
            >
              {vipTutorEditSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </section>
      <div
        className="login-overlay"
        hidden={!vipTutorEditModal.open}
        onClick={closeVipTutorEditModal}
      />
    </>
  );

  return (
    <>
      {createPortal(vipDailyRoutineEditModalLayer, document.body)}
      {createPortal(vipDailyRoutineDeleteModalLayer, document.body)}
      {createPortal(vipClassAddModalLayer, document.body)}
      {createPortal(vipClassDeleteModalLayer, document.body)}
      {createPortal(vipTutorEditModalLayer, document.body)}
    </>
  );
}

export default VipAssignmentModals;
