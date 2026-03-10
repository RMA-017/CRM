import { createPortal } from "react-dom";
import { normalizeVipAttendanceStatus } from "../profile.vip-utils.js";

function VipAttendanceModals({
  vipAttendanceAbsentModal,
  setVipAttendanceAbsentModal,
  vipAttendanceAbsentSaving,
  maxAbsentReasonLength,
  canCreateAppointmentVipClients,
  canUpdateAppointmentVipClients,
  handleVipAttendanceAbsentReasonSave,
  closeVipAttendanceAbsentModal,
  vipAttendanceEditModal,
  setVipAttendanceEditModal,
  vipAttendanceEditSaving,
  vipAttendanceEditAction,
  maxEditNoteLength,
  canDeleteAppointmentVipClients,
  handleVipAttendanceEditDelete,
  handleVipAttendanceEditSave,
  closeVipAttendanceEditModal
}) {
  if (typeof document === "undefined") {
    return null;
  }

  const vipAttendanceAbsentModalLayer = (
    <>
      <section
        id="vipAttendanceAbsentReasonModal"
        className="logout-confirm-modal vip-attendance-absent-modal"
        hidden={!vipAttendanceAbsentModal.open}
      >
        <div className="all-users-head">
          <h3>Why absent?</h3>
          <button
            id="closeVipAttendanceAbsentReasonModalBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close absent reason modal"
            onClick={closeVipAttendanceAbsentModal}
          >
            ×
          </button>
        </div>

        <label className="field" htmlFor="vipAttendanceAbsentReasonInput">
          <span>Reason</span>
          <textarea
            id="vipAttendanceAbsentReasonInput"
            className="notify-textarea vip-attendance-absent-textarea"
            value={vipAttendanceAbsentModal.reason}
            maxLength={maxAbsentReasonLength}
            placeholder="Write reason"
            onChange={(event) => {
              const nextValue = String(event.currentTarget.value || "").slice(0, maxAbsentReasonLength);
              setVipAttendanceAbsentModal((prev) => ({
                ...prev,
                reason: nextValue,
                error: ""
              }));
            }}
          />
        </label>
        <p className="vip-attendance-absent-reason-count">
          {vipAttendanceAbsentModal.reason.length}/{maxAbsentReasonLength}
        </p>

        <div className="edit-actions vip-attendance-absent-actions">
          <button
            id="saveVipAttendanceAbsentReasonBtn"
            type="button"
            className="btn"
            disabled={vipAttendanceAbsentSaving || (!canCreateAppointmentVipClients && !canUpdateAppointmentVipClients)}
            onClick={() => {
              void handleVipAttendanceAbsentReasonSave();
            }}
          >
            {vipAttendanceAbsentSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </section>
      <div
        className="login-overlay"
        hidden={!vipAttendanceAbsentModal.open}
        onClick={closeVipAttendanceAbsentModal}
      />
    </>
  );

  const vipAttendanceEditModalLayer = (
    <>
      <section
        id="vipAttendanceEditModal"
        className="logout-confirm-modal vip-attendance-edit-modal"
        hidden={!vipAttendanceEditModal.open}
      >
        <div className="all-users-head">
          <h3>Edit attendance</h3>
          <button
            id="closeVipAttendanceEditModalBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close edit attendance modal"
            onClick={closeVipAttendanceEditModal}
          >
            ×
          </button>
        </div>

        {(() => {
          const normalizedStatus = normalizeVipAttendanceStatus(vipAttendanceEditModal.status);
          const isPresentMode = normalizedStatus === "present";
          const isAbsentMode = normalizedStatus === "absent";
          return (
            <>
              <div className="vip-attendance-edit-grid">
                <label className="field" htmlFor="vipAttendanceEditArrivalInput">
                  <span>Arrival time</span>
                  <input
                    id="vipAttendanceEditArrivalInput"
                    type="datetime-local"
                    value={vipAttendanceEditModal.arrivalTime}
                    disabled={isAbsentMode}
                    onChange={(event) => {
                      const nextValue = String(event.currentTarget.value || "").trim();
                      setVipAttendanceEditModal((prev) => ({
                        ...prev,
                        arrivalTime: nextValue,
                        departureTime: nextValue ? prev.departureTime : "",
                        error: ""
                      }));
                    }}
                  />
                </label>
                <label className="field" htmlFor="vipAttendanceEditDepartureInput">
                  <span>Departure time</span>
                  <input
                    id="vipAttendanceEditDepartureInput"
                    type="datetime-local"
                    value={vipAttendanceEditModal.departureTime}
                    disabled={isAbsentMode || !vipAttendanceEditModal.arrivalTime}
                    onChange={(event) => {
                      const nextValue = String(event.currentTarget.value || "").trim();
                      setVipAttendanceEditModal((prev) => ({
                        ...prev,
                        departureTime: nextValue,
                        error: ""
                      }));
                    }}
                  />
                </label>
              </div>

              <label className="field" htmlFor="vipAttendanceEditNoteInput">
                <span>Absent</span>
                <textarea
                  id="vipAttendanceEditNoteInput"
                  className="notify-textarea vip-attendance-edit-textarea"
                  value={vipAttendanceEditModal.note}
                  maxLength={maxEditNoteLength}
                  placeholder="Write note"
                  disabled={isPresentMode}
                  onChange={(event) => {
                    const nextValue = String(event.currentTarget.value || "").slice(0, maxEditNoteLength);
                    setVipAttendanceEditModal((prev) => ({
                      ...prev,
                      note: nextValue,
                      error: ""
                    }));
                  }}
                />
              </label>
              <p className="vip-attendance-edit-note-count">
                {vipAttendanceEditModal.note.length}/{maxEditNoteLength}
              </p>
            </>
          );
        })()}

        <div className="edit-actions vip-attendance-edit-actions">
          <button
            id="deleteVipAttendanceEditBtn"
            type="button"
            className="table-action-btn table-action-btn-danger"
            disabled={vipAttendanceEditSaving || !canDeleteAppointmentVipClients}
            onClick={() => {
              void handleVipAttendanceEditDelete();
            }}
          >
            {vipAttendanceEditSaving && vipAttendanceEditAction === "delete" ? "Deleting..." : "Delete"}
          </button>
          <button
            id="saveVipAttendanceEditBtn"
            type="button"
            className="btn"
            disabled={vipAttendanceEditSaving || (!canCreateAppointmentVipClients && !canUpdateAppointmentVipClients)}
            onClick={() => {
              void handleVipAttendanceEditSave();
            }}
          >
            {vipAttendanceEditSaving && vipAttendanceEditAction === "save" ? "Saving..." : "Save"}
          </button>
        </div>
      </section>
      <div
        className="login-overlay"
        hidden={!vipAttendanceEditModal.open}
        onClick={closeVipAttendanceEditModal}
      />
    </>
  );

  return (
    <>
      {createPortal(vipAttendanceAbsentModalLayer, document.body)}
      {createPortal(vipAttendanceEditModalLayer, document.body)}
    </>
  );
}

export default VipAttendanceModals;
