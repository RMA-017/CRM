import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import CustomSelect from "../../components/CustomSelect.jsx";
import { formatDateYMD } from "../../lib/formatters.js";
import AppointmentScheduler from "./AppointmentScheduler.jsx";
import AppointmentSettingsPanel from "./AppointmentSettingsPanel.jsx";

function formatAttendanceDateTime(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "-";
  }
  const directMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  if (directMatch) {
    const [, year, month, day, hours, minutes] = directMatch;
    return `${day}.${month}.${year} ${hours}:${minutes}`;
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = String(parsed.getFullYear()).padStart(4, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

function normalizeVipAttendanceStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "present" || normalized === "absent") {
    return normalized;
  }
  return "unmarked";
}

const VIP_ATTENDANCE_ABSENT_REASON_MAX_LENGTH = 120;
const VIP_ATTENDANCE_EDIT_NOTE_MAX_LENGTH = 255;

function ProfileMainContent({
  mainView,
  allUsersMessage,
  allUsers,
  canUpdateUsers,
  canDeleteUsers,
  openAllUsersEditModal,
  openAllUsersDeleteModal,
  allUsersPage,
  allUsersTotalPages,
  loadAllUsers,
  closeAllUsersPanel,
  closeAllClientsPanel,
  closeCreateClientPanel,
  clients,
  clientsMessage,
  clientsPage,
  clientsTotalPages,
  loadClients,
  vipClients,
  vipClientsMessage,
  vipClientsPage,
  vipClientsTotalPages,
  loadVipClients,
  vipAttendancePeriod,
  setVipAttendancePeriodField,
  vipAttendanceItems,
  vipAttendanceTeacherOptions,
  vipAttendanceDraftByClientId,
  vipAttendanceMessage,
  vipAttendanceLoading,
  vipAttendanceSavingByClientId,
  markVipAttendancePresent,
  markVipAttendanceLeft,
  saveVipAttendanceAbsentReason,
  saveVipAttendanceEdit,
  loadVipAttendance,
  vipClassItems,
  vipClassTeachers,
  vipClassMessage,
  vipClassLoading,
  vipClassSavingById,
  saveVipClassAssignment,
  deleteVipClassAssignment,
  vipAssignmentItems,
  vipAssignmentClasses,
  vipAssignmentTutors,
  vipAssignmentMessage,
  vipAssignmentLoading,
  vipAssignmentSavingByClientId,
  saveVipAssignment,
  canCreateClients,
  canUpdateClients,
  canDeleteClients,
  clientCreateForm,
  clientCreateErrors,
  clientCreateSubmitting,
  setClientCreateForm,
  setClientCreateErrors,
  handleClientCreateSubmit,
  startClientEdit,
  openClientsDeleteModal,
  canCreateAppointments,
  canUpdateAppointments,
  canDeleteAppointments,
  closeAppointmentPanel,
  closeAppointmentBreaksPanel,
  closeAppointmentVipSchedulePanel,
  closeAppointmentVipAttendancePanel,
  closeAppointmentVipAssignmentsPanel,
  closeAppointmentVipTutorAssignmentsPanel,
  closeAppointmentSettingsPanel,
  closeAppointmentVipClientsPanel,
  closeOrganizationsPanel,
  closeRolesPanel,
  closePositionsPanel,
  closeAdminOptionsPanel,
  closeNotificationsSettingsPanel,
  canSendNotifications,
  notificationSendForm,
  notificationSendSubmitting,
  setNotificationSendForm,
  sendManualNotification,
  organizations,
  organizationsMessage,
  organizationCreateForm,
  organizationCreateError,
  organizationCreateSubmitting,
  setOrganizationCreateForm,
  setOrganizationCreateError,
  handleOrganizationCreateSubmit,
  startOrganizationEdit,
  organizationDeletingId,
  handleOrganizationDelete,
  rolesSettings,
  rolesSettingsMessage,
  roleCreateForm,
  roleCreateError,
  roleCreateSubmitting,
  setRoleCreateForm,
  setRoleCreateError,
  handleRoleCreateSubmit,
  startRoleEdit,
  roleDeletingId,
  handleRoleDelete,
  positionsSettings,
  positionsSettingsMessage,
  positionCreateForm,
  positionCreateError,
  positionCreateSubmitting,
  setPositionCreateForm,
  setPositionCreateError,
  handlePositionCreateSubmit,
  startPositionEdit,
  positionDeletingId,
  handlePositionDelete,
  adminOptionsForm,
  adminOptionsError,
  adminOptionsSubmitting,
  setAdminOptionsForm,
  setAdminOptionsError,
  loadAdminOptions,
  handleAdminOptionsSubmit,
  canCreateUsers,
  handleCreateUserSubmit,
  createForm,
  createErrors,
  createSubmitting,
  createOrganizationOptions,
  setCreateForm,
  setCreateErrors,
  roleOptions,
  closeCreateUserPanel,
  profile,
  onAppointmentNotification
}) {
  const maxBirthdayYmd = new Date().toISOString().slice(0, 10);
  const profileRoleText = `${String(profile?.role || "").trim().toLowerCase()} ${String(profile?.position || "").trim().toLowerCase()}`;
  const isSpecialistUser = profileRoleText.includes("specialist") || profileRoleText.includes("spetsialist");
  const [vipAttendanceFilter, setVipAttendanceFilter] = useState("all");
  const [vipAttendanceClientFilter, setVipAttendanceClientFilter] = useState("all");
  const [vipAttendanceTeacherFilter, setVipAttendanceTeacherFilter] = useState("all");
  const [vipAttendanceAbsentModal, setVipAttendanceAbsentModal] = useState({
    open: false,
    clientId: "",
    reason: "",
    error: ""
  });
  const [vipAttendanceAbsentSaving, setVipAttendanceAbsentSaving] = useState(false);
  const [vipAttendanceEditModal, setVipAttendanceEditModal] = useState({
    open: false,
    clientId: "",
    arrivalTime: "",
    departureTime: "",
    note: "",
    error: ""
  });
  const [vipAttendanceEditSaving, setVipAttendanceEditSaving] = useState(false);
  const [vipClassDraft, setVipClassDraft] = useState({
    classId: "",
    className: "",
    teacherId: ""
  });
  const [vipClassFormError, setVipClassFormError] = useState("");
  const [vipClassAddModalOpen, setVipClassAddModalOpen] = useState(false);
  const [vipClassModalMode, setVipClassModalMode] = useState("add");
  const [vipClassModalSaving, setVipClassModalSaving] = useState(false);
  const [vipClassDeleteModal, setVipClassDeleteModal] = useState({
    open: false,
    classId: "",
    className: "",
    error: ""
  });
  const [vipClassDeleteSaving, setVipClassDeleteSaving] = useState(false);
  const [vipTutorEditModal, setVipTutorEditModal] = useState({
    open: false,
    clientId: "",
    classId: "",
    tutorId: "",
    error: ""
  });
  const [vipTutorEditSaving, setVipTutorEditSaving] = useState(false);

  useEffect(() => {
    if (mainView === "appointment-vip-assignments") {
      return;
    }
    setVipClassDraft({
      classId: "",
      className: "",
      teacherId: ""
    });
    setVipClassFormError("");
    setVipClassAddModalOpen(false);
    setVipClassModalMode("add");
    setVipClassModalSaving(false);
    setVipClassDeleteModal({
      open: false,
      classId: "",
      className: "",
      error: ""
    });
    setVipClassDeleteSaving(false);
  }, [mainView]);

  useEffect(() => {
    if (mainView === "appointment-vip-tutor-assignments") {
      return;
    }
    setVipTutorEditModal({
      open: false,
      clientId: "",
      classId: "",
      tutorId: "",
      error: ""
    });
    setVipTutorEditSaving(false);
  }, [mainView]);

  useEffect(() => {
    if (
      !vipAttendanceAbsentModal.open &&
      !vipAttendanceEditModal.open &&
      !vipClassAddModalOpen &&
      !vipClassDeleteModal.open &&
      !vipTutorEditModal.open
    ) {
      return undefined;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [
    vipAttendanceAbsentModal.open,
    vipAttendanceEditModal.open,
    vipClassAddModalOpen,
    vipClassDeleteModal.open,
    vipTutorEditModal.open
  ]);

  function closeVipAttendanceAbsentModal() {
    setVipAttendanceAbsentModal({
      open: false,
      clientId: "",
      reason: "",
      error: ""
    });
    setVipAttendanceAbsentSaving(false);
  }

  function closeVipAttendanceEditModal() {
    setVipAttendanceEditModal({
      open: false,
      clientId: "",
      arrivalTime: "",
      departureTime: "",
      note: "",
      error: ""
    });
    setVipAttendanceEditSaving(false);
  }

  useEffect(() => {
    if (mainView !== "appointment-vip-attendance" && (vipAttendanceAbsentModal.open || vipAttendanceEditModal.open)) {
      setVipAttendanceAbsentModal({
        open: false,
        clientId: "",
        reason: "",
        error: ""
      });
      setVipAttendanceAbsentSaving(false);
      setVipAttendanceEditModal({
        open: false,
        clientId: "",
        arrivalTime: "",
        departureTime: "",
        note: "",
        error: ""
      });
      setVipAttendanceEditSaving(false);
    }
  }, [mainView, vipAttendanceAbsentModal.open, vipAttendanceEditModal.open]);

  useEffect(() => {
    const normalizedClientId = String(vipAttendanceClientFilter || "").trim();
    if (!normalizedClientId || normalizedClientId === "all") {
      return;
    }
    const existsInList = vipAttendanceItems.some((item) => String(item?.id || "").trim() === normalizedClientId);
    if (!existsInList) {
      setVipAttendanceClientFilter("all");
    }
  }, [vipAttendanceClientFilter, vipAttendanceItems]);

  useEffect(() => {
    const normalizedTeacherId = String(vipAttendanceTeacherFilter || "").trim();
    if (!normalizedTeacherId || normalizedTeacherId === "all") {
      return;
    }
    const existsInList = (Array.isArray(vipAttendanceTeacherOptions) ? vipAttendanceTeacherOptions : [])
      .some((item) => String(item?.id || "").trim() === normalizedTeacherId);
    if (!existsInList) {
      setVipAttendanceTeacherFilter("all");
    }
  }, [vipAttendanceTeacherFilter, vipAttendanceTeacherOptions]);

  function openVipAttendanceAbsentModal(clientId, currentReason) {
    const normalizedClientId = String(clientId || "").trim();
    if (!normalizedClientId) {
      return;
    }
    setVipAttendanceAbsentSaving(false);
    setVipAttendanceAbsentModal({
      open: true,
      clientId: normalizedClientId,
      reason: String(currentReason || "").trim().slice(0, VIP_ATTENDANCE_ABSENT_REASON_MAX_LENGTH),
      error: ""
    });
  }

  function openVipAttendanceEditModal(clientId, {
    arrivedAt = "",
    leftAt = "",
    note = ""
  } = {}) {
    const normalizedClientId = String(clientId || "").trim();
    if (!normalizedClientId) {
      return;
    }
    setVipAttendanceEditSaving(false);
    setVipAttendanceEditModal({
      open: true,
      clientId: normalizedClientId,
      arrivalTime: String(arrivedAt || "").trim(),
      departureTime: String(leftAt || "").trim(),
      note: String(note || "").trim().slice(0, VIP_ATTENDANCE_EDIT_NOTE_MAX_LENGTH),
      error: ""
    });
  }

  async function handleVipAttendanceAbsentReasonSave() {
    const normalizedClientId = String(vipAttendanceAbsentModal.clientId || "").trim();
    if (!normalizedClientId) {
      closeVipAttendanceAbsentModal();
      return;
    }
    const normalizedReason = String(vipAttendanceAbsentModal.reason || "").trim();
    if (!normalizedReason) {
      setVipAttendanceAbsentModal((prev) => ({ ...prev, error: "Reason is required." }));
      return;
    }
    if (normalizedReason.length > VIP_ATTENDANCE_ABSENT_REASON_MAX_LENGTH) {
      setVipAttendanceAbsentModal((prev) => ({ ...prev, error: `Reason is too long (max ${VIP_ATTENDANCE_ABSENT_REASON_MAX_LENGTH}).` }));
      return;
    }
    setVipAttendanceAbsentSaving(true);
    const saveResult = await saveVipAttendanceAbsentReason(normalizedClientId, normalizedReason);
    if (!saveResult?.ok) {
      setVipAttendanceAbsentModal((prev) => ({
        ...prev,
        error: String(saveResult?.message || "Failed to save absent reason.").trim()
      }));
      setVipAttendanceAbsentSaving(false);
      return;
    }
    closeVipAttendanceAbsentModal();
  }

  async function handleVipAttendanceEditSave() {
    const normalizedClientId = String(vipAttendanceEditModal.clientId || "").trim();
    if (!normalizedClientId) {
      closeVipAttendanceEditModal();
      return;
    }
    const normalizedArrivalTime = String(vipAttendanceEditModal.arrivalTime || "").trim();
    const normalizedDepartureTime = String(vipAttendanceEditModal.departureTime || "").trim();
    const normalizedNote = String(vipAttendanceEditModal.note || "").trim();

    if (normalizedDepartureTime && !normalizedArrivalTime) {
      setVipAttendanceEditModal((prev) => ({ ...prev, error: "Arrival time is required when departure time is set." }));
      return;
    }
    if (normalizedArrivalTime && normalizedDepartureTime && normalizedDepartureTime < normalizedArrivalTime) {
      setVipAttendanceEditModal((prev) => ({ ...prev, error: "Departure time must be later than arrival time." }));
      return;
    }
    if (normalizedNote.length > VIP_ATTENDANCE_EDIT_NOTE_MAX_LENGTH) {
      setVipAttendanceEditModal((prev) => ({ ...prev, error: `Note is too long (max ${VIP_ATTENDANCE_EDIT_NOTE_MAX_LENGTH}).` }));
      return;
    }

    setVipAttendanceEditSaving(true);
    const saveResult = await saveVipAttendanceEdit(normalizedClientId, {
      arrivedAt: normalizedArrivalTime,
      leftAt: normalizedDepartureTime,
      note: normalizedNote
    });
    if (!saveResult?.ok) {
      setVipAttendanceEditModal((prev) => ({
        ...prev,
        error: String(saveResult?.message || "Failed to save VIP attendance.").trim()
      }));
      setVipAttendanceEditSaving(false);
      return;
    }
    closeVipAttendanceEditModal();
  }

  const vipClassTeacherOptions = (Array.isArray(vipClassTeachers) ? vipClassTeachers : [])
    .map((item) => ({
      value: String(item?.id || "").trim(),
      label: String(item?.name || "").trim() || `Teacher #${String(item?.id || "").trim()}`
    }))
    .filter((item) => Boolean(item.value));
  const vipClassRows = (Array.isArray(vipClassItems) ? vipClassItems : [])
    .map((item) => ({
      id: String(item?.id || item?.classId || "").trim(),
      className: String(item?.className || item?.class_name || "").trim(),
      teacherId: String(item?.teacherId || item?.teacher_id || "").trim(),
      teacherName: String(item?.teacherName || item?.teacher_name || "").trim(),
      childrenCount: Math.max(0, Number.parseInt(String(item?.childrenCount || item?.children_count || "0"), 10) || 0)
    }))
    .filter((item) => Boolean(item.id));
  const vipAssignmentClassOptions = (Array.isArray(vipAssignmentClasses) ? vipAssignmentClasses : [])
    .map((item) => {
      const classId = String(item?.id || item?.classId || "").trim();
      const className = String(item?.className || item?.class_name || "").trim();
      const teacherName = String(item?.teacherName || item?.teacher_name || "").trim();
      if (!classId || !className) {
        return null;
      }
      return {
        value: classId,
        label: teacherName ? `${className} (${teacherName})` : className
      };
    })
    .filter(Boolean);
  const vipAssignmentTutorOptions = (Array.isArray(vipAssignmentTutors) ? vipAssignmentTutors : [])
    .map((item) => ({
      value: String(item?.id || "").trim(),
      label: String(item?.name || "").trim() || `Tutor #${String(item?.id || "").trim()}`
    }))
    .filter((item) => Boolean(item.value));

  function openVipClassAddModal() {
    setVipClassModalMode("add");
    setVipClassDraft({
      classId: "",
      className: "",
      teacherId: ""
    });
    setVipClassFormError("");
    setVipClassModalSaving(false);
    setVipClassAddModalOpen(true);
  }

  function openVipClassEditModal(row) {
    const normalizedId = String(row?.id || row?.classId || "").trim();
    if (!normalizedId) {
      return;
    }
    setVipClassModalMode("edit");
    setVipClassDraft({
      classId: normalizedId,
      className: String(row?.className || "").trim(),
      teacherId: String(row?.teacherId || "").trim()
    });
    setVipClassFormError("");
    setVipClassModalSaving(false);
    setVipClassAddModalOpen(true);
  }

  function closeVipClassAddModal() {
    setVipClassAddModalOpen(false);
    setVipClassModalMode("add");
    setVipClassDraft({
      classId: "",
      className: "",
      teacherId: ""
    });
    setVipClassFormError("");
    setVipClassModalSaving(false);
  }

  function openVipClassDeleteModal(row) {
    const classId = String(row?.id || row?.classId || "").trim();
    if (!classId) {
      return;
    }
    setVipClassDeleteModal({
      open: true,
      classId,
      className: String(row?.className || "").trim(),
      error: ""
    });
    setVipClassDeleteSaving(false);
  }

  function closeVipClassDeleteModal() {
    setVipClassDeleteModal({
      open: false,
      classId: "",
      className: "",
      error: ""
    });
    setVipClassDeleteSaving(false);
  }

  async function handleVipClassSave() {
    const className = String(vipClassDraft?.className || "").trim();
    const teacherId = String(vipClassDraft?.teacherId || "").trim();
    const classId = String(vipClassDraft?.classId || "").trim();
    if (!className) {
      setVipClassFormError("Class name is required.");
      return;
    }
    if (className.length > 64) {
      setVipClassFormError("Class name is too long (max 64).");
      return;
    }
    if (!teacherId) {
      setVipClassFormError("Teacher is required.");
      return;
    }
    setVipClassModalSaving(true);
    const result = await saveVipClassAssignment({
      classId: classId || null,
      className,
      teacherId
    });
    if (!result?.ok) {
      setVipClassFormError(String(result?.message || "Failed to save class assignment.").trim());
      setVipClassModalSaving(false);
      return;
    }
    closeVipClassAddModal();
  }

  async function confirmVipClassDelete() {
    const classId = String(vipClassDeleteModal.classId || "").trim();
    if (!classId) {
      closeVipClassDeleteModal();
      return;
    }
    setVipClassDeleteSaving(true);
    const result = await deleteVipClassAssignment(classId);
    if (!result?.ok) {
      setVipClassDeleteModal((prev) => ({
        ...prev,
        error: String(result?.message || "Failed to delete class assignment.").trim()
      }));
      setVipClassDeleteSaving(false);
      return;
    }
    closeVipClassDeleteModal();
  }

  function openVipTutorEditModal(row) {
    const clientId = String(row?.id || "").trim();
    if (!clientId) {
      return;
    }
    setVipTutorEditModal({
      open: true,
      clientId,
      classId: String(row?.classId || "").trim(),
      tutorId: String(row?.tutorId || "").trim(),
      error: ""
    });
  }

  function closeVipTutorEditModal() {
    setVipTutorEditModal({
      open: false,
      clientId: "",
      classId: "",
      tutorId: "",
      error: ""
    });
    setVipTutorEditSaving(false);
  }

  async function handleVipTutorEditSave() {
    const clientId = String(vipTutorEditModal.clientId || "").trim();
    const classId = String(vipTutorEditModal.classId || "").trim();
    const tutorId = String(vipTutorEditModal.tutorId || "").trim();
    if (!clientId) {
      closeVipTutorEditModal();
      return;
    }
    if (!classId) {
      setVipTutorEditModal((prev) => ({ ...prev, error: "Class is required." }));
      return;
    }
    if (!tutorId) {
      setVipTutorEditModal((prev) => ({ ...prev, error: "Tutor is required." }));
      return;
    }
    setVipTutorEditSaving(true);
    const saveResult = await saveVipAssignment(clientId, {
      classId,
      tutorId
    });
    if (!saveResult?.ok) {
      setVipTutorEditModal((prev) => ({
        ...prev,
        error: String(saveResult?.message || "Failed to save tutor assignment.").trim()
      }));
      setVipTutorEditSaving(false);
      return;
    }
    closeVipTutorEditModal();
  }

  const adminOptionsOrganizationOptions = Array.isArray(organizations)
    ? organizations
        .map((item) => {
          const id = String(item?.id || "").trim();
          if (!id) {
            return null;
          }
          const name = String(item?.name || "").trim();
          const code = String(item?.code || "").trim().toLowerCase();
          const label = name && code
            ? `${name} (${code})`
            : (name || code || `Organization #${id}`);
          return { value: id, label };
        })
        .filter(Boolean)
    : [];

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
            maxLength={VIP_ATTENDANCE_ABSENT_REASON_MAX_LENGTH}
            placeholder="Write reason"
            onChange={(event) => {
              const nextValue = String(event.currentTarget.value || "").slice(0, VIP_ATTENDANCE_ABSENT_REASON_MAX_LENGTH);
              setVipAttendanceAbsentModal((prev) => ({
                ...prev,
                reason: nextValue,
                error: ""
              }));
            }}
          />
        </label>
        <p className="vip-attendance-absent-reason-count">
          {vipAttendanceAbsentModal.reason.length}/{VIP_ATTENDANCE_ABSENT_REASON_MAX_LENGTH}
        </p>

        <p className="settings-error" hidden={!vipAttendanceAbsentModal.error}>
          {vipAttendanceAbsentModal.error}
        </p>

        <div className="edit-actions vip-attendance-absent-actions">
          <button
            id="saveVipAttendanceAbsentReasonBtn"
            type="button"
            className="btn"
            disabled={vipAttendanceAbsentSaving}
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

        <div className="vip-attendance-edit-grid">
          <label className="field" htmlFor="vipAttendanceEditArrivalInput">
            <span>Arrival time</span>
            <input
              id="vipAttendanceEditArrivalInput"
              type="datetime-local"
              value={vipAttendanceEditModal.arrivalTime}
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
              disabled={!vipAttendanceEditModal.arrivalTime}
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
          <span>Note</span>
          <textarea
            id="vipAttendanceEditNoteInput"
            className="notify-textarea vip-attendance-edit-textarea"
            value={vipAttendanceEditModal.note}
            maxLength={VIP_ATTENDANCE_EDIT_NOTE_MAX_LENGTH}
            placeholder="Write note"
            onChange={(event) => {
              const nextValue = String(event.currentTarget.value || "").slice(0, VIP_ATTENDANCE_EDIT_NOTE_MAX_LENGTH);
              setVipAttendanceEditModal((prev) => ({
                ...prev,
                note: nextValue,
                error: ""
              }));
            }}
          />
        </label>
        <p className="vip-attendance-edit-note-count">
          {vipAttendanceEditModal.note.length}/{VIP_ATTENDANCE_EDIT_NOTE_MAX_LENGTH}
        </p>

        <p className="settings-error" hidden={!vipAttendanceEditModal.error}>
          {vipAttendanceEditModal.error}
        </p>

        <div className="edit-actions vip-attendance-edit-actions">
          <button
            id="saveVipAttendanceEditBtn"
            type="button"
            className="btn"
            disabled={vipAttendanceEditSaving}
            onClick={() => {
              void handleVipAttendanceEditSave();
            }}
          >
            {vipAttendanceEditSaving ? "Saving..." : "Save"}
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
            <label className="appointment-breaks-add-field" htmlFor="vipClassModalNameInput">
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

            <div className="appointment-breaks-add-field">
              <span>Teacher</span>
              <CustomSelect
                id="vipClassModalTeacherSelect"
                placeholder="Select teacher"
                value={String(vipClassDraft?.teacherId || "")}
                options={vipClassTeacherOptions}
                searchable
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

          <p className="settings-error" hidden={!vipClassFormError}>
            {vipClassFormError}
          </p>

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
        <p className="settings-error" hidden={!vipClassDeleteModal.error}>
          {vipClassDeleteModal.error}
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
            {vipClassDeleteSaving ? "Deleting..." : "Delete"}
          </button>
          <button
            id="vipClassDeleteNoBtn"
            type="button"
            className="header-btn"
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
            <div className="appointment-breaks-add-field">
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

            <div className="appointment-breaks-add-field">
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

          <p className="settings-error" hidden={!vipTutorEditModal.error}>
            {vipTutorEditModal.error}
          </p>

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
      <main className={`home-main${(mainView === "create-user" || mainView === "clients-create") ? " home-main-centered" : ""}`} aria-label="Main content">
      {mainView === "all-users" && (
        <section id="allUsersPanel" className="all-users-panel">
          <div className="all-users-head">
            <h3>All Users</h3>
            <button
              id="closeAllUsersBtn"
              type="button"
              className="header-btn panel-close-btn"
              aria-label="Close all users panel"
              onClick={closeAllUsersPanel}
            >
              ×
            </button>
          </div>

          <p id="allUsersState" className="all-users-state" hidden={!allUsersMessage}>
            {allUsersMessage}
          </p>

          <div id="allUsersTableWrap" className="all-users-table-wrap" hidden={allUsers.length === 0}>
            <table className="all-users-table" aria-label="All users table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Organization</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Full Name</th>
                  <th>Birthday</th>
                  <th>Phone</th>
                  <th>Position</th>
                  <th>Role</th>
                  <th>Created At</th>
                  <th>Edit</th>
                  <th>Delete</th>
                </tr>
              </thead>
              <tbody id="allUsersTableBody">
                {allUsers.map((user) => {
                  return (
                    <tr key={String(user.id)}>
                      <td>{user.id || "-"}</td>
                      <td>
                        {user.organizationName && user.organizationCode
                          ? `${user.organizationName} (${user.organizationCode})`
                          : (user.organizationCode || "-")}
                      </td>
                      <td>{user.username || "-"}</td>
                      <td>{user.email || "-"}</td>
                      <td>{user.fullName || "-"}</td>
                      <td>{formatDateYMD(user.birthday)}</td>
                      <td>{user.phone || "-"}</td>
                      <td>{user.position || "-"}</td>
                      <td>{user.role || "-"}</td>
                      <td>{formatDateYMD(user.createdAt)}</td>
                      <td>
                        <button
                          type="button"
                          className="table-action-btn"
                          disabled={!canUpdateUsers}
                          onClick={() => openAllUsersEditModal(user.id)}
                        >
                          Edit
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="table-action-btn table-action-btn-danger"
                          disabled={!canDeleteUsers}
                          onClick={() => openAllUsersDeleteModal(user.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div id="allUsersPagination" className="all-users-pagination" hidden={allUsers.length === 0}>
            <button
              id="allUsersPrevBtn"
              type="button"
              className="header-btn"
              disabled={allUsersPage <= 1}
              onClick={() => loadAllUsers(allUsersPage - 1)}
            >
              Previous
            </button>
            <span id="allUsersPageInfo" className="all-users-page-info">
              Page {allUsersPage} of {allUsersTotalPages}
            </span>
            <button
              id="allUsersNextBtn"
              type="button"
              className="header-btn"
              disabled={allUsersPage >= allUsersTotalPages}
              onClick={() => loadAllUsers(allUsersPage + 1)}
            >
              Next
            </button>
          </div>
        </section>
      )}

      {mainView === "clients-all" && (
        <section id="clientsPanel" className="all-users-panel">
          <div className="all-users-head">
            <h3>All Clients</h3>
            <button
              id="closeAllClientsBtn"
              type="button"
              className="header-btn panel-close-btn"
              aria-label="Close all clients panel"
              onClick={closeAllClientsPanel}
            >
              ×
            </button>
          </div>

          <p className="all-users-state" hidden={!clientsMessage}>
            {clientsMessage}
          </p>

          <div className="all-users-table-wrap" hidden={clients.length === 0}>
            <table className="all-users-table" aria-label="Clients table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>First Name</th>
                  <th>Last Name</th>
                  <th>Middle Name</th>
                  <th>Birthday</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>VIP</th>
                  <th>Created At</th>
                  <th>Note</th>
                  <th>Edit</th>
                  <th>Delete</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((item) => {
                  const rowId = String(item.id || "");
                  const firstName = String(item.firstName || item.first_name || "").trim();
                  const lastName = String(item.lastName || item.last_name || "").trim();
                  const middleName = String(item.middleName || item.middle_name || "").trim();
                  const displayBirthday = String(item.birthday || item.birthdate || "").trim();
                  const displayTgMail = String(
                    item.tgMail || item.telegramOrEmail || item.telegram_or_email || item.tg_mail || ""
                  ).trim();
                  const displayNote = String(item.note || "").trim() || "-";
                  const isVip = Boolean(item.isVip ?? item.is_vip);
                  const createdAt = item.createdAt || item.created_at || "";

                  return (
                    <tr key={rowId}>
                      <td>{rowId || "-"}</td>
                      <td>{firstName || "-"}</td>
                      <td>{lastName || "-"}</td>
                      <td>{middleName || "-"}</td>
                      <td>{formatDateYMD(displayBirthday)}</td>
                      <td>{item.phone || item.phone_number || "-"}</td>
                      <td>{displayTgMail || "-"}</td>
                      <td>{isVip ? "Yes" : "No"}</td>
                      <td>{formatDateYMD(createdAt)}</td>
                      <td>{displayNote}</td>
                      <td>
                        <button
                          type="button"
                          className="table-action-btn"
                          disabled={!canUpdateClients}
                          onClick={() => startClientEdit(item)}
                        >
                          Edit
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="table-action-btn table-action-btn-danger"
                          disabled={!canDeleteClients}
                          onClick={() => openClientsDeleteModal(item)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="all-users-pagination" hidden={clients.length === 0}>
            <button
              type="button"
              className="header-btn"
              disabled={clientsPage <= 1}
              onClick={() => loadClients(clientsPage - 1)}
            >
              Previous
            </button>
            <span className="all-users-page-info">
              Page {clientsPage} of {clientsTotalPages}
            </span>
            <button
              type="button"
              className="header-btn"
              disabled={clientsPage >= clientsTotalPages}
              onClick={() => loadClients(clientsPage + 1)}
            >
              Next
            </button>
          </div>
        </section>
      )}

      {mainView === "clients-create" && (
        <section id="createClientPanel" className="create-user-panel">
          <div className="all-users-head">
            <h3>Create Client</h3>
            <button
              id="closeCreateClientBtn"
              type="button"
              className="header-btn panel-close-btn"
              aria-label="Close create client panel"
              onClick={closeCreateClientPanel}
            >
              ×
            </button>
          </div>

          {!canCreateClients ? (
            <p className="all-users-state">You do not have permission to create clients.</p>
          ) : (
            <form className="auth-form" noValidate onSubmit={handleClientCreateSubmit}>
              <div className="field">
                <label htmlFor="clientCreateFirstName">First Name</label>
                <input
                  id="clientCreateFirstName"
                  name="firstName"
                  type="text"
                  required
                  placeholder="First Name"
                  className={clientCreateErrors.firstName ? "input-error" : ""}
                  value={clientCreateForm.firstName}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setClientCreateForm((prev) => ({ ...prev, firstName: nextValue }));
                    if (clientCreateErrors.firstName) {
                      setClientCreateErrors((prev) => ({ ...prev, firstName: "" }));
                    }
                  }}
                />
                <small className="field-error">{clientCreateErrors.firstName || ""}</small>
              </div>

              <div className="field">
                <label htmlFor="clientCreateLastName">Last Name</label>
                <input
                  id="clientCreateLastName"
                  name="lastName"
                  type="text"
                  required
                  placeholder="Last Name"
                  className={clientCreateErrors.lastName ? "input-error" : ""}
                  value={clientCreateForm.lastName}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setClientCreateForm((prev) => ({ ...prev, lastName: nextValue }));
                    if (clientCreateErrors.lastName) {
                      setClientCreateErrors((prev) => ({ ...prev, lastName: "" }));
                    }
                  }}
                />
                <small className="field-error">{clientCreateErrors.lastName || ""}</small>
              </div>

              <div className="field">
                <label htmlFor="clientCreateMiddleName">Middle Name</label>
                <input
                  id="clientCreateMiddleName"
                  name="middleName"
                  type="text"
                  placeholder="Middle Name"
                  className={clientCreateErrors.middleName ? "input-error" : ""}
                  value={clientCreateForm.middleName}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setClientCreateForm((prev) => ({ ...prev, middleName: nextValue }));
                    if (clientCreateErrors.middleName) {
                      setClientCreateErrors((prev) => ({ ...prev, middleName: "" }));
                    }
                  }}
                />
                <small className="field-error">{clientCreateErrors.middleName || ""}</small>
              </div>

              <div className="client-birthday-vip-row">
                <div className="field">
                  <label htmlFor="clientCreateBirthday">Birthday</label>
                  <input
                    id="clientCreateBirthday"
                    name="birthday"
                    type="date"
                    required
                    min="1950-01-01"
                    max={maxBirthdayYmd}
                    className={clientCreateErrors.birthday ? "input-error" : ""}
                    value={clientCreateForm.birthday}
                    onInput={(event) => {
                      const nextValue = event.currentTarget.value;
                      setClientCreateForm((prev) => ({ ...prev, birthday: nextValue }));
                      if (clientCreateErrors.birthday) {
                        setClientCreateErrors((prev) => ({ ...prev, birthday: "" }));
                      }
                    }}
                  />
                  <small className="field-error">{clientCreateErrors.birthday || ""}</small>
                </div>

                <div className="field clients-create-vip-field">
                  <label htmlFor="clientCreateIsVip">VIP</label>
                  <label
                    className={`clients-create-vip-toggle${clientCreateForm.isVip ? " is-active" : ""}`}
                    htmlFor="clientCreateIsVip"
                  >
                    <input
                      id="clientCreateIsVip"
                      type="checkbox"
                      checked={Boolean(clientCreateForm.isVip)}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        setClientCreateForm((prev) => ({ ...prev, isVip: checked }));
                      }}
                    />
                  </label>
                  <small className="field-error">{clientCreateErrors.isVip || ""}</small>
                </div>
              </div>

              <div className="field">
                <label htmlFor="clientCreatePhone">Phone Number</label>
                <input
                  id="clientCreatePhone"
                  name="phone"
                  type="tel"
                  placeholder="+998977861070"
                  className={clientCreateErrors.phone ? "input-error" : ""}
                  value={clientCreateForm.phone}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setClientCreateForm((prev) => ({ ...prev, phone: nextValue }));
                    if (clientCreateErrors.phone) {
                      setClientCreateErrors((prev) => ({ ...prev, phone: "" }));
                    }
                  }}
                />
                <small className="field-error">{clientCreateErrors.phone || ""}</small>
              </div>

              <div className="field">
                <label htmlFor="clientCreateTelegramOrEmail">Email</label>
                <input
                  id="clientCreateTelegramOrEmail"
                  name="telegramOrEmail"
                  type="text"
                  placeholder="user@gmail.com"
                  className={clientCreateErrors.telegramOrEmail ? "input-error" : ""}
                  value={clientCreateForm.telegramOrEmail}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setClientCreateForm((prev) => ({ ...prev, telegramOrEmail: nextValue }));
                    if (clientCreateErrors.telegramOrEmail) {
                      setClientCreateErrors((prev) => ({ ...prev, telegramOrEmail: "" }));
                    }
                  }}
                />
                <small className="field-error">{clientCreateErrors.telegramOrEmail || ""}</small>
              </div>

              <button id="createClientBtn" className="btn" type="submit" disabled={clientCreateSubmitting}>
                Create
              </button>
            </form>
          )}
        </section>
      )}

      {mainView === "appointment" && (
        <section id="appointmentPanel" className="all-users-panel">
          <div className="all-users-head">
            <h3>Appointment Schedule</h3>
            <button
              id="closeAppointmentBtn"
              type="button"
              className="header-btn panel-close-btn"
              aria-label="Close appointment panel"
              onClick={closeAppointmentPanel}
            >
              ×
            </button>
          </div>
          <AppointmentScheduler
            canCreateAppointments={canCreateAppointments}
            canUpdateAppointments={canUpdateAppointments}
            canDeleteAppointments={canDeleteAppointments}
            currentUserId={String(profile?.id || "").trim()}
            restrictCreateToOwnSpecialist={isSpecialistUser}
            onNotification={onAppointmentNotification}
          />
        </section>
      )}

      {mainView === "appointment-settings" && (
        <section id="appointmentSettingsPanel" className="all-users-panel settings-panel">
          <div className="all-users-head">
            <h3>Appointment Settings</h3>
            <button
              id="closeAppointmentSettingsBtn"
              type="button"
              className="header-btn panel-close-btn"
              aria-label="Close appointment settings panel"
              onClick={closeAppointmentSettingsPanel}
            >
              ×
            </button>
          </div>
          <AppointmentSettingsPanel
            canUpdateAppointments={canUpdateAppointments}
            panelMode="settings"
            organizations={organizations}
            profile={profile}
          />
        </section>
      )}

      {mainView === "appointment-vip-schedule" && (
        <section id="appointmentVipSchedulePanel" className="all-users-panel">
          <div className="all-users-head">
            <h3>VIP Schedule</h3>
            <button
              id="closeAppointmentVipScheduleBtn"
              type="button"
              className="header-btn panel-close-btn"
              aria-label="Close VIP schedule panel"
              onClick={closeAppointmentVipSchedulePanel}
            >
              ×
            </button>
          </div>
          <AppointmentScheduler
            canCreateAppointments={canCreateAppointments}
            canUpdateAppointments={canUpdateAppointments}
            canDeleteAppointments={canDeleteAppointments}
            currentUserId={String(profile?.id || "").trim()}
            restrictCreateToOwnSpecialist={isSpecialistUser}
            vipOnly
            onNotification={onAppointmentNotification}
          />
        </section>
      )}

      {mainView === "appointment-breaks" && (
        <section id="appointmentBreaksPanel" className="all-users-panel settings-panel">
          <div className="all-users-head">
            <h3>Appointment Breaks</h3>
            <button
              id="closeAppointmentBreaksBtn"
              type="button"
              className="header-btn panel-close-btn"
              aria-label="Close appointment breaks panel"
              onClick={closeAppointmentBreaksPanel}
            >
              ×
            </button>
          </div>
          <AppointmentSettingsPanel
            canUpdateAppointments={canUpdateAppointments}
            panelMode="breaks"
            organizations={organizations}
            profile={profile}
          />
        </section>
      )}

      {mainView === "appointment-vip-clients" && (
        <section id="appointmentVipClientsPanel" className="all-users-panel">
          <div className="all-users-head">
            <h3>All VIP Clients</h3>
            <button
              id="closeAppointmentVipClientsBtn"
              type="button"
              className="header-btn panel-close-btn"
              aria-label="Close VIP clients panel"
              onClick={closeAppointmentVipClientsPanel}
            >
              ×
            </button>
          </div>

          <p className="all-users-state" hidden={!vipClientsMessage}>
            {vipClientsMessage}
          </p>

          <div className="all-users-table-wrap" hidden={vipClients.length === 0}>
            <table className="all-users-table" aria-label="VIP clients table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>First Name</th>
                  <th>Last Name</th>
                  <th>Middle Name</th>
                  <th>Birthday</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>VIP</th>
                  <th>Created At</th>
                  <th>Note</th>
                  <th>Edit</th>
                </tr>
              </thead>
              <tbody>
                {vipClients.map((item) => {
                  const rowId = String(item.id || "");
                  const firstName = String(item.firstName || item.first_name || "").trim();
                  const lastName = String(item.lastName || item.last_name || "").trim();
                  const middleName = String(item.middleName || item.middle_name || "").trim();
                  const displayBirthday = String(item.birthday || item.birthdate || "").trim();
                  const displayTgMail = String(
                    item.tgMail || item.telegramOrEmail || item.telegram_or_email || item.tg_mail || ""
                  ).trim();
                  const displayNote = String(item.note || "").trim() || "-";
                  const isVip = Boolean(item.isVip ?? item.is_vip);
                  const createdAt = item.createdAt || item.created_at || "";

                  return (
                    <tr key={rowId}>
                      <td>{rowId || "-"}</td>
                      <td>{firstName || "-"}</td>
                      <td>{lastName || "-"}</td>
                      <td>{middleName || "-"}</td>
                      <td>{formatDateYMD(displayBirthday)}</td>
                      <td>{item.phone || item.phone_number || "-"}</td>
                      <td>{displayTgMail || "-"}</td>
                      <td>{isVip ? "Yes" : "No"}</td>
                      <td>{formatDateYMD(createdAt)}</td>
                      <td>{displayNote}</td>
                      <td>
                        <button
                          type="button"
                          className="table-action-btn"
                          disabled={!canUpdateClients}
                          onClick={() => startClientEdit(item, "vip")}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="all-users-pagination" hidden={vipClients.length === 0}>
            <button
              type="button"
              className="header-btn"
              disabled={vipClientsPage <= 1}
              onClick={() => loadVipClients(vipClientsPage - 1)}
            >
              Previous
            </button>
            <span className="all-users-page-info">
              Page {vipClientsPage} of {vipClientsTotalPages}
            </span>
            <button
              type="button"
              className="header-btn"
              disabled={vipClientsPage >= vipClientsTotalPages}
              onClick={() => loadVipClients(vipClientsPage + 1)}
            >
              Next
            </button>
          </div>
        </section>
      )}

      {mainView === "appointment-vip-attendance" && (() => {
        const normalizedFilter = ["all", "present", "absent"].includes(String(vipAttendanceFilter || "").trim().toLowerCase())
          ? String(vipAttendanceFilter || "").trim().toLowerCase()
          : "all";
        const normalizedClientFilter = String(vipAttendanceClientFilter || "").trim() || "all";
        const normalizedTeacherFilter = String(vipAttendanceTeacherFilter || "").trim() || "all";
        const vipAttendanceTeacherFilterOptions = [
          { value: "all", label: "All" },
          ...(Array.isArray(vipAttendanceTeacherOptions) ? vipAttendanceTeacherOptions : []).map((item) => ({
            value: String(item?.id || "").trim(),
            label: String(item?.name || "").trim() || `Teacher #${String(item?.id || "").trim()}`
          })).filter((item) => Boolean(item.value))
        ];
        const vipAttendanceClientOptions = [
          { value: "all", label: "All" },
          ...vipAttendanceItems.map((item) => {
            const rowId = String(item.id || "").trim();
            const fullName = `${String(item.firstName || "").trim()} ${String(item.lastName || "").trim()} ${String(item.middleName || "").trim()}`
              .replace(/\s+/g, " ")
              .trim();
            return {
              value: rowId,
              label: fullName || `Child #${rowId}`
            };
          })
        ];
        const childFilteredItems = vipAttendanceItems.filter((item) => {
          if (normalizedClientFilter === "all") {
            return true;
          }
          return String(item.id || "").trim() === normalizedClientFilter;
        });
        const teacherFilteredItems = childFilteredItems.filter((item) => {
          if (normalizedTeacherFilter === "all") {
            return true;
          }
          return String(item.teacherId || item.teacher_id || "").trim() === normalizedTeacherFilter;
        });
        const presentCount = teacherFilteredItems.reduce((sum, item) => {
          const rowId = String(item.id || "").trim();
          const status = normalizeVipAttendanceStatus(vipAttendanceDraftByClientId?.[rowId]?.status);
          return status === "present"
            ? sum + 1
            : sum;
        }, 0);
        const absentCount = teacherFilteredItems.reduce((sum, item) => {
          const rowId = String(item.id || "").trim();
          const status = normalizeVipAttendanceStatus(vipAttendanceDraftByClientId?.[rowId]?.status);
          return status === "absent"
            ? sum + 1
            : sum;
        }, 0);
        const filteredAttendanceItems = teacherFilteredItems.filter((item) => {
          const status = normalizeVipAttendanceStatus(vipAttendanceDraftByClientId?.[String(item.id || "")]?.status);
          if (normalizedFilter === "present") {
            return status === "present";
          }
          if (normalizedFilter === "absent") {
            return status === "absent";
          }
          return true;
        });

        return (
          <section id="appointmentVipAttendancePanel" className="all-users-panel">
            <div className="all-users-head">
              <h3>VIP Attendance</h3>
              <button
                id="closeAppointmentVipAttendanceBtn"
                type="button"
                className="header-btn panel-close-btn"
                aria-label="Close VIP attendance panel"
                onClick={closeAppointmentVipAttendancePanel}
              >
                ×
              </button>
            </div>

            <div className="vip-attendance-toolbar">
              <label className="field vip-attendance-teacher-field" htmlFor="vipAttendanceTeacherFilterSelect">
                <span>Teacher</span>
                <CustomSelect
                  id="vipAttendanceTeacherFilterSelect"
                  value={normalizedTeacherFilter}
                  options={vipAttendanceTeacherFilterOptions}
                  placeholder="All"
                  searchable
                  searchThreshold={8}
                  onChange={(nextValue) => {
                    const normalizedValue = String(nextValue || "").trim() || "all";
                    setVipAttendanceTeacherFilter(normalizedValue);
                  }}
                />
              </label>
              <label className="field vip-attendance-client-field" htmlFor="vipAttendanceClientFilterSelect">
                <span>Child</span>
                <CustomSelect
                  id="vipAttendanceClientFilterSelect"
                  value={normalizedClientFilter}
                  options={vipAttendanceClientOptions}
                  placeholder="All"
                  searchable
                  searchThreshold={8}
                  onChange={(nextValue) => {
                    const normalizedValue = String(nextValue || "").trim() || "all";
                    setVipAttendanceClientFilter(normalizedValue);
                  }}
                />
              </label>
              <div className="vip-attendance-period-grid" aria-label="Attendance period">
                <label className="field vip-attendance-date-field" htmlFor="vipAttendanceFromInput">
                  <span>From</span>
                  <input
                    id="vipAttendanceFromInput"
                    type="date"
                    value={String(vipAttendancePeriod?.from || "")}
                    onChange={(event) => setVipAttendancePeriodField("from", event.currentTarget.value)}
                  />
                </label>
                <label className="field vip-attendance-date-field" htmlFor="vipAttendanceToInput">
                  <span>To</span>
                  <input
                    id="vipAttendanceToInput"
                    type="date"
                    value={String(vipAttendancePeriod?.to || "")}
                    onChange={(event) => setVipAttendancePeriodField("to", event.currentTarget.value)}
                  />
                </label>
              </div>
              <button
                id="reloadVipAttendanceBtn"
                type="button"
                className="header-btn"
                onClick={() => loadVipAttendance()}
                disabled={vipAttendanceLoading}
              >
                {vipAttendanceLoading ? "Loading..." : "Reload"}
              </button>
              <div className="vip-attendance-summary">
                <button
                  id="vipAttendanceFilterAllBtn"
                  type="button"
                  className={`vip-attendance-filter-btn${normalizedFilter === "all" ? " is-active" : ""}`}
                  onClick={() => setVipAttendanceFilter("all")}
                >
                  Total: {teacherFilteredItems.length}
                </button>
                <button
                  id="vipAttendanceFilterPresentBtn"
                  type="button"
                  className={`vip-attendance-filter-btn${normalizedFilter === "present" ? " is-active" : ""}`}
                  onClick={() => setVipAttendanceFilter("present")}
                >
                  Present: {presentCount}
                </button>
                <button
                  id="vipAttendanceFilterAbsentBtn"
                  type="button"
                  className={`vip-attendance-filter-btn${normalizedFilter === "absent" ? " is-active" : ""}`}
                  onClick={() => setVipAttendanceFilter("absent")}
                >
                  Absent: {absentCount}
                </button>
              </div>
            </div>

            <p className="all-users-state" hidden={!vipAttendanceMessage}>
              {vipAttendanceMessage}
            </p>
            <p className="all-users-state" hidden={vipAttendanceItems.length === 0 || filteredAttendanceItems.length > 0}>
              No children in selected filter.
            </p>

            <div className="all-users-table-wrap" hidden={filteredAttendanceItems.length === 0}>
              <table className="all-users-table" aria-label="VIP attendance table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Child name</th>
                    <th>Tutor name</th>
                    <th>Arrival time</th>
                    <th>Departure time</th>
                    <th>Note</th>
                    <th>Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAttendanceItems.map((item) => {
                    const rowId = String(item.id || "").trim();
                    const fullName = `${String(item.firstName || "").trim()} ${String(item.lastName || "").trim()} ${String(item.middleName || "").trim()}`
                      .replace(/\s+/g, " ")
                      .trim();
                    const attendanceEntry = vipAttendanceDraftByClientId?.[rowId] || {};
                    const status = normalizeVipAttendanceStatus(attendanceEntry?.status);
                    const arrivedAt = String(attendanceEntry?.arrivedAt || "").trim();
                    const leftAt = String(attendanceEntry?.leftAt || "").trim();
                    const note = String(attendanceEntry?.note || item.note || "").trim();
                    const isSaving = Boolean(vipAttendanceSavingByClientId?.[rowId]);
                    const isPresent = status === "present";
                    const isUnmarked = status === "unmarked";
                    return (
                      <tr key={`vipAttendanceRow_${rowId}`}>
                        <td>{rowId || "-"}</td>
                        <td>{fullName || "-"}</td>
                        <td>{String(item.tutorName || "").trim() || "-"}</td>
                        <td>
                          {arrivedAt ? (
                            formatAttendanceDateTime(arrivedAt)
                          ) : isUnmarked ? (
                            <button
                              id={`vipAttendancePresentBtn_${rowId}`}
                              type="button"
                              className="table-action-btn"
                              disabled={isSaving}
                              onClick={() => {
                                void markVipAttendancePresent(rowId);
                              }}
                            >
                              {isSaving ? "Saving..." : "Present"}
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td>
                          {leftAt ? (
                            formatAttendanceDateTime(leftAt)
                          ) : (isPresent && Boolean(arrivedAt) ? (
                            <button
                              id={`vipAttendanceLeftBtn_${rowId}`}
                              type="button"
                              className="table-action-btn"
                              disabled={isSaving}
                              onClick={() => {
                                void markVipAttendanceLeft(rowId);
                              }}
                            >
                              {isSaving ? "Saving..." : "Left"}
                            </button>
                          ) : "-")}
                        </td>
                        <td className="vip-attendance-note-cell">
                          <div className="vip-attendance-note-inline">
                            <span className="vip-attendance-note-text">
                              {note || "-"}
                            </span>
                            {isUnmarked ? (
                              <button
                                id={`vipAttendanceAbsentBtn_${rowId}`}
                                type="button"
                                className="table-action-btn table-action-btn-danger"
                                disabled={isSaving}
                                onClick={() => openVipAttendanceAbsentModal(rowId, note)}
                              >
                                {isSaving ? "Saving..." : "Absent"}
                              </button>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <button
                            id={`vipAttendanceEditBtn_${rowId}`}
                            type="button"
                            className="table-action-btn"
                            disabled={isSaving}
                            onClick={() => openVipAttendanceEditModal(rowId, {
                              arrivedAt,
                              leftAt,
                              note
                            })}
                          >
                            {isSaving ? "Saving..." : "Edit"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          </section>
        );
      })()}

      {mainView === "appointment-vip-assignments" && (
        <section id="appointmentBreaksPanel">
          <div className="all-users-head">
            <h3>Class</h3>
            <button
              id="closeAppointmentVipAssignmentsBtn"
              type="button"
              className="header-btn panel-close-btn"
              aria-label="Close VIP assignments panel"
              onClick={closeAppointmentVipAssignmentsPanel}
            >
              ×
            </button>
          </div>

          <div className="appointment-breaks-view" aria-label="Class assignments list">
            <div className="appointment-breaks-toolbar-actions">
              <button
                id="openVipClassAddModalBtn"
                type="button"
                className="header-btn appointment-breaks-add-icon-btn"
                aria-label="Add class"
                title="Add class"
                onClick={openVipClassAddModal}
              >
                +
              </button>
            </div>

            <div className="appointment-breaks-table-wrap all-users-table-wrap">
              {!vipClassLoading && (
                <table className="appointment-breaks-table class-assignments-table all-users-table" aria-label="Class table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Class</th>
                      <th>Teacher</th>
                      <th>Children</th>
                      <th>Edit</th>
                      <th>Delete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vipClassRows.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="appointment-breaks-empty">
                          No classes found.
                        </td>
                      </tr>
                    ) : vipClassRows.map((row, index) => {
                      const classId = String(row?.id || "").trim();
                      const isClassSaving = Boolean(vipClassSavingById?.[classId]);
                      return (
                      <tr key={`vipClassRow_${String(classId || index)}`}>
                        <td>{String(row?.id || index + 1)}</td>
                        <td>{String(row?.className || "-")}</td>
                        <td>{String(row?.teacherName || "-")}</td>
                        <td>{row.childrenCount}</td>
                        <td>
                          <button
                            type="button"
                            className="table-action-btn"
                            disabled={isClassSaving || vipClassModalSaving}
                            onClick={() => openVipClassEditModal(row)}
                          >
                            Edit
                          </button>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="table-action-btn table-action-btn-danger"
                            disabled={isClassSaving || vipClassModalSaving || vipClassDeleteSaving}
                            onClick={() => {
                              openVipClassDeleteModal(row);
                            }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>
      )}

      {mainView === "appointment-vip-tutor-assignments" && (
        <section id="appointmentVipTutorAssignmentsPanel">
          <div className="all-users-head">
            <h3>Tutor</h3>
            <button
              id="closeAppointmentVipTutorAssignmentsBtn"
              type="button"
              className="header-btn panel-close-btn"
              aria-label="Close VIP tutor assignments panel"
              onClick={closeAppointmentVipTutorAssignmentsPanel}
            >
              ×
            </button>
          </div>

          <div className="appointment-breaks-view" aria-label="VIP tutor assignments list">
            <div className="appointment-breaks-table-wrap all-users-table-wrap">
              {!vipAssignmentLoading && (
                <table className="appointment-breaks-table tutor-assignments-table all-users-table" aria-label="Tutor assignments table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Child</th>
                      <th>Class</th>
                      <th>Tutor</th>
                      <th>Edit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vipAssignmentItems.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="appointment-breaks-empty">
                          No VIP clients found.
                        </td>
                      </tr>
                    ) : vipAssignmentItems.map((row, index) => {
                      const rowId = String(row?.id || "").trim();
                      const fullName = [row?.lastName, row?.firstName, row?.middleName]
                        .map((part) => String(part || "").trim())
                        .filter(Boolean)
                        .join(" ");
                      const isSaving = Boolean(vipAssignmentSavingByClientId?.[rowId]);
                      return (
                        <tr key={`vipTutorAssignRow_${String(rowId || index)}`}>
                          <td>{String(row?.id || index + 1)}</td>
                          <td>{fullName || "-"}</td>
                          <td>{String(row?.className || "-")}</td>
                          <td>{String(row?.tutorName || "-")}</td>
                          <td>
                            <button
                              type="button"
                              className="table-action-btn"
                              disabled={isSaving}
                              onClick={() => openVipTutorEditModal(row)}
                            >
                              {isSaving ? "Saving..." : "Edit"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>
      )}

      {mainView === "settings-organizations" && (
        <section id="organizationsPanel" className="all-users-panel settings-panel">
          <div className="all-users-head">
            <h3>Organization Settings</h3>
            <button
              id="closeOrganizationsBtn"
              type="button"
              className="header-btn panel-close-btn"
              aria-label="Close organizations panel"
              onClick={closeOrganizationsPanel}
            >
              ×
            </button>
          </div>

          <form className="auth-form settings-create-form" noValidate onSubmit={handleOrganizationCreateSubmit}>
            <div className="settings-form-grid settings-form-grid-org settings-form-grid-org-with-active">
              <div className="field">
                <label htmlFor="organizationCodeInput">Code</label>
                <input
                  id="organizationCodeInput"
                  name="code"
                  type="text"
                  placeholder="organization-code"
                  value={organizationCreateForm.code}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setOrganizationCreateForm((prev) => ({ ...prev, code: nextValue }));
                    if (organizationCreateError) {
                      setOrganizationCreateError("");
                    }
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="organizationNameInput">Name</label>
                <input
                  id="organizationNameInput"
                  name="name"
                  type="text"
                  placeholder="Organization Name"
                  value={organizationCreateForm.name}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setOrganizationCreateForm((prev) => ({ ...prev, name: nextValue }));
                    if (organizationCreateError) {
                      setOrganizationCreateError("");
                    }
                  }}
                />
              </div>
              <div className="field settings-inline-control">
                <label className="settings-spacer-label" aria-hidden="true">&nbsp;</label>
                <label className="settings-checkbox" htmlFor="organizationIsActiveInput">
                  <input
                    id="organizationIsActiveInput"
                    type="checkbox"
                    aria-label="Active"
                    checked={Boolean(organizationCreateForm.isActive)}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setOrganizationCreateForm((prev) => ({ ...prev, isActive: checked }));
                    }}
                  />
                  <span className="settings-checkbox-text">Active</span>
                </label>
              </div>
              <div className="field settings-inline-control settings-action-field">
                <label aria-hidden="true">&nbsp;</label>
                <button className="btn settings-add-btn" type="submit" disabled={organizationCreateSubmitting}>
                  Add
                </button>
              </div>
            </div>
            <small className="field-error settings-error">{organizationCreateError}</small>
          </form>

          <p id="organizationsState" className="all-users-state" hidden={!organizationsMessage}>
            {organizationsMessage}
          </p>

          <div className="all-users-table-wrap settings-table-wrap" hidden={organizations.length === 0}>
            <table className="all-users-table settings-table" aria-label="Organizations table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Active</th>
                  <th>Created</th>
                  <th>Edit</th>
                  <th>Delete</th>
                </tr>
              </thead>
              <tbody>
                {organizations.map((item) => {
                  const rowId = String(item.id);
                  return (
                    <tr key={rowId}>
                      <td>{rowId}</td>
                      <td>{item.code || "-"}</td>
                      <td>{item.name || "-"}</td>
                      <td>{item.isActive ? "Yes" : "No"}</td>
                      <td>{formatDateYMD(item.createdAt)}</td>
                      <td>
                        <button
                          type="button"
                          className="table-action-btn"
                          onClick={() => startOrganizationEdit(item)}
                        >
                          Edit
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="table-action-btn table-action-btn-danger"
                          disabled={organizationDeletingId === rowId}
                          onClick={() => handleOrganizationDelete(rowId, item?.name || item?.code || rowId)}
                        >
                          {organizationDeletingId === rowId ? "..." : "Delete"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {mainView === "settings-roles" && (
        <section id="rolesPanel" className="all-users-panel settings-panel">
          <div className="all-users-head">
            <h3>Role Settings</h3>
            <button
              id="closeRolesBtn"
              type="button"
              className="header-btn panel-close-btn"
              aria-label="Close roles panel"
              onClick={closeRolesPanel}
            >
              ×
            </button>
          </div>

          <form className="auth-form settings-create-form" noValidate onSubmit={handleRoleCreateSubmit}>
            <div className="settings-form-grid">
              <div className="field">
                <label htmlFor="roleLabelInput">Label</label>
                <input
                  id="roleLabelInput"
                  name="label"
                  type="text"
                  placeholder="Manager"
                  value={roleCreateForm.label}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setRoleCreateForm((prev) => ({ ...prev, label: nextValue }));
                    if (roleCreateError) {
                      setRoleCreateError("");
                    }
                  }}
                />
              </div>
              <div className="field settings-inline-control">
                <label className="settings-spacer-label" aria-hidden="true">&nbsp;</label>
                <label className="settings-checkbox" htmlFor="roleIsActiveInput">
                  <input
                    id="roleIsActiveInput"
                    type="checkbox"
                    aria-label="Active"
                    checked={Boolean(roleCreateForm.isActive)}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setRoleCreateForm((prev) => ({ ...prev, isActive: checked }));
                    }}
                  />
                  <span className="settings-checkbox-text">Active</span>
                </label>
              </div>
              <div className="field settings-inline-control settings-action-field">
                <label aria-hidden="true">&nbsp;</label>
                <button className="btn settings-add-btn" type="submit" disabled={roleCreateSubmitting}>
                  Add
                </button>
              </div>
            </div>
            <small className="field-error settings-error">{roleCreateError}</small>
          </form>

          <p id="rolesState" className="all-users-state" hidden={!rolesSettingsMessage}>
            {rolesSettingsMessage}
          </p>

          <div className="all-users-table-wrap settings-table-wrap" hidden={rolesSettings.length === 0}>
            <table className="all-users-table settings-table" aria-label="Roles table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Label</th>
                  <th>Active</th>
                  <th>Created</th>
                  <th>Edit</th>
                  <th>Delete</th>
                </tr>
              </thead>
              <tbody>
                {rolesSettings.map((item) => {
                  const rowId = String(item.id);
                  return (
                    <tr key={rowId}>
                      <td>{rowId}</td>
                      <td>{item.label || "-"}</td>
                      <td>{item.isActive ? "Yes" : "No"}</td>
                      <td>{formatDateYMD(item.createdAt)}</td>
                      <td>
                        <button
                          type="button"
                          className="table-action-btn table-action-btn-role-permissions"
                          onClick={() => startRoleEdit(item)}
                        >
                          Edit
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="table-action-btn table-action-btn-danger"
                          disabled={roleDeletingId === rowId}
                          onClick={() => handleRoleDelete(rowId, item?.label || rowId)}
                        >
                          {roleDeletingId === rowId ? "..." : "Delete"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {mainView === "settings-positions" && (
        <section id="positionsPanel" className="all-users-panel settings-panel">
          <div className="all-users-head">
            <h3>Position Settings</h3>
            <button
              id="closePositionsBtn"
              type="button"
              className="header-btn panel-close-btn"
              aria-label="Close positions panel"
              onClick={closePositionsPanel}
            >
              ×
            </button>
          </div>

          <form className="auth-form settings-create-form" noValidate onSubmit={handlePositionCreateSubmit}>
            <div className="settings-form-grid">
              <div className="field">
                <label htmlFor="positionLabelInput">Label</label>
                <input
                  id="positionLabelInput"
                  name="label"
                  type="text"
                  placeholder="New Position Label"
                  value={positionCreateForm.label}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setPositionCreateForm((prev) => ({ ...prev, label: nextValue }));
                    if (positionCreateError) {
                      setPositionCreateError("");
                    }
                  }}
                />
              </div>
              <div className="field settings-inline-control">
                <label className="settings-spacer-label" aria-hidden="true">&nbsp;</label>
                <label className="settings-checkbox" htmlFor="positionIsActiveInput">
                  <input
                    id="positionIsActiveInput"
                    type="checkbox"
                    aria-label="Active"
                    checked={Boolean(positionCreateForm.isActive)}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setPositionCreateForm((prev) => ({ ...prev, isActive: checked }));
                    }}
                  />
                  <span className="settings-checkbox-text">Active</span>
                </label>
              </div>
              <div className="field settings-inline-control settings-action-field">
                <label aria-hidden="true">&nbsp;</label>
                <button className="btn settings-add-btn" type="submit" disabled={positionCreateSubmitting}>
                  Add
                </button>
              </div>
            </div>
            <small className="field-error settings-error">{positionCreateError}</small>
          </form>

          <p id="positionsState" className="all-users-state" hidden={!positionsSettingsMessage}>
            {positionsSettingsMessage}
          </p>

          <div className="all-users-table-wrap settings-table-wrap" hidden={positionsSettings.length === 0}>
            <table className="all-users-table settings-table" aria-label="Positions table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Label</th>
                  <th>Active</th>
                  <th>Created</th>
                  <th>Edit</th>
                  <th>Delete</th>
                </tr>
              </thead>
              <tbody>
                {positionsSettings.map((item) => {
                  const rowId = String(item.id);
                  return (
                    <tr key={rowId}>
                      <td>{rowId}</td>
                      <td>{item.label || "-"}</td>
                      <td>{item.isActive ? "Yes" : "No"}</td>
                      <td>{formatDateYMD(item.createdAt)}</td>
                      <td>
                        <button
                          type="button"
                          className="table-action-btn"
                          onClick={() => startPositionEdit(item)}
                        >
                          Edit
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="table-action-btn table-action-btn-danger"
                          disabled={positionDeletingId === rowId}
                          onClick={() => handlePositionDelete(rowId, item?.label || rowId)}
                        >
                          {positionDeletingId === rowId ? "..." : "Delete"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {mainView === "settings-notifications" && (
        <section id="notificationsSettingsPanel" className="all-users-panel settings-panel">
          <div className="all-users-head">
            <h3>Notification Settings</h3>
            <button
              id="closeNotificationsSettingsBtn"
              type="button"
              className="header-btn panel-close-btn"
              aria-label="Close notifications settings panel"
              onClick={closeNotificationsSettingsPanel}
            >
              ×
            </button>
          </div>

          <form
            className="auth-form settings-create-form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void sendManualNotification();
            }}
            hidden={!canSendNotifications}
          >
            <div className="settings-form-grid settings-form-grid-notify">
              <div className="field">
                <label htmlFor="notificationTargetRole">Recipients</label>
                <CustomSelect
                  id="notificationTargetRole"
                  value={String(notificationSendForm?.targetRole || "all")}
                  options={[
                    { value: "all", label: "All Users" },
                    ...(rolesSettings || [])
                      .filter((r) => r.isActive)
                      .map((r) => ({
                        value: String(r.label || "").trim().toLowerCase(),
                        label: String(r.label || "").trim()
                      }))
                  ]}
                  onChange={(nextValue) => {
                    setNotificationSendForm((prev) => ({ ...prev, targetRole: nextValue }));
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="notificationMessageInput">Message</label>
                <textarea
                  id="notificationMessageInput"
                  name="message"
                  maxLength={255}
                  placeholder="Write notification message"
                  className="notify-textarea"
                  rows={1}
                  value={String(notificationSendForm?.message || "")}
                  onInput={(event) => {
                    const el = event.currentTarget;
                    el.style.height = "auto";
                    el.style.height = `${el.scrollHeight}px`;
                    const nextValue = el.value;
                    setNotificationSendForm((prev) => ({ ...prev, message: nextValue }));
                  }}
                />
              </div>
              <div className="field settings-inline-control settings-action-field">
                <label aria-hidden="true">&nbsp;</label>
                <button className="btn settings-add-btn" type="submit" disabled={notificationSendSubmitting}>
                  {notificationSendSubmitting ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          </form>
        </section>
      )}

      {mainView === "settings-admin-options" && (
        <section id="adminOptionsPanel" className="all-users-panel settings-panel">
          <div className="all-users-head">
            <h3>Admin Options</h3>
            <button
              id="closeAdminOptionsBtn"
              type="button"
              className="header-btn panel-close-btn"
              aria-label="Close admin options panel"
              onClick={closeAdminOptionsPanel}
            >
              ×
            </button>
          </div>

          <form className="auth-form settings-create-form" noValidate onSubmit={handleAdminOptionsSubmit}>
            <div className="settings-form-grid settings-form-grid-org">
              <div className="field">
                <label htmlFor="adminOptionsOrganizationSelect">Organization</label>
                <CustomSelect
                  id="adminOptionsOrganizationSelect"
                  value={String(adminOptionsForm?.organizationId || "")}
                  placeholder={adminOptionsOrganizationOptions.length === 0 ? "No organizations" : "Select organization"}
                  options={adminOptionsOrganizationOptions}
                  onChange={(nextValue) => {
                    const nextOrganizationId = String(nextValue || "").trim();
                    setAdminOptionsForm((prev) => ({
                      ...prev,
                      organizationId: nextOrganizationId
                    }));
                    setAdminOptionsError("");
                    if (nextOrganizationId) {
                      void loadAdminOptions(nextOrganizationId);
                    }
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="adminOptionsHistoryLockDaysInput">Schedule Edit Lock (days)</label>
                <input
                  id="adminOptionsHistoryLockDaysInput"
                  name="appointmentHistoryLockDays"
                  type="number"
                  min={0}
                  max={3650}
                  step={1}
                  value={String(adminOptionsForm?.appointmentHistoryLockDays || "")}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setAdminOptionsForm((prev) => ({
                      ...prev,
                      appointmentHistoryLockDays: nextValue
                    }));
                    if (adminOptionsError) {
                      setAdminOptionsError("");
                    }
                  }}
                />
              </div>
              <div className="field settings-inline-control settings-action-field">
                <label aria-hidden="true">&nbsp;</label>
                <button className="btn settings-add-btn" type="submit" disabled={adminOptionsSubmitting}>
                  {adminOptionsSubmitting ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </form>
        </section>
      )}

      {mainView === "create-user" && (
        <section id="createUserPanel" className="create-user-panel">
          <div className="all-users-head">
            <h3>Create User</h3>
            <button
              id="closeCreateUserBtn"
              type="button"
              className="header-btn panel-close-btn"
              aria-label="Close create user panel"
              onClick={closeCreateUserPanel}
            >
              ×
            </button>
          </div>

          {!canCreateUsers ? (
            <p className="all-users-state">You do not have permission to create users.</p>
          ) : (
            <form className="auth-form" id="adminCreateForm" noValidate onSubmit={handleCreateUserSubmit}>
              <div className="field">
                <label htmlFor="createUserOrganizationCode">Organisation</label>
                <CustomSelect
                  id="createUserOrganizationCode"
                  placeholder="Select organisation"
                  value={createForm.organizationCode}
                  options={createOrganizationOptions}
                  error={Boolean(createErrors.organizationCode)}
                  onChange={(nextCode) => {
                    setCreateForm((prev) => ({ ...prev, organizationCode: nextCode }));
                    if (createErrors.organizationCode) {
                      setCreateErrors((prev) => ({ ...prev, organizationCode: "" }));
                    }
                  }}
                />
                <small className="field-error">{createErrors.organizationCode || ""}</small>
              </div>

              <div className="field">
                <label htmlFor="username">Username</label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  placeholder="Username"
                  autoComplete="username"
                  required
                  className={createErrors.username ? "input-error" : ""}
                  value={createForm.username}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setCreateForm((prev) => ({ ...prev, username: nextValue }));
                    if (createErrors.username) {
                      setCreateErrors((prev) => ({ ...prev, username: "" }));
                    }
                  }}
                />
                <small className="field-error" id="usernameError">{createErrors.username || ""}</small>
              </div>

              <div className="field">
                <label htmlFor="fullName">Full Name</label>
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  placeholder="Muhammad Rahmonov"
                  autoComplete="name"
                  required
                  className={createErrors.fullName ? "input-error" : ""}
                  value={createForm.fullName}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setCreateForm((prev) => ({ ...prev, fullName: nextValue }));
                    if (createErrors.fullName) {
                      setCreateErrors((prev) => ({ ...prev, fullName: "" }));
                    }
                  }}
                />
                <small className="field-error" id="fullNameError">{createErrors.fullName || ""}</small>
              </div>

              <div className="field">
                <label htmlFor="roleSelect">Role</label>
                <CustomSelect
                  id="roleSelect"
                  placeholder="Select role"
                  value={createForm.role}
                  options={roleOptions}
                  error={Boolean(createErrors.role)}
                  onChange={(nextRole) => {
                    setCreateForm((prev) => ({ ...prev, role: nextRole }));
                    if (createErrors.role) {
                      setCreateErrors((prev) => ({ ...prev, role: "" }));
                    }
                  }}
                />
                <small className="field-error" id="roleError">{createErrors.role || ""}</small>
              </div>

              <button id="adminCreateBtn" className="btn" type="submit" disabled={createSubmitting}>
                Create
              </button>
            </form>
          )}
        </section>
      )}
      </main>
      {typeof document !== "undefined" ? createPortal(vipAttendanceAbsentModalLayer, document.body) : null}
      {typeof document !== "undefined" ? createPortal(vipAttendanceEditModalLayer, document.body) : null}
      {typeof document !== "undefined" ? createPortal(vipClassAddModalLayer, document.body) : null}
      {typeof document !== "undefined" ? createPortal(vipClassDeleteModalLayer, document.body) : null}
      {typeof document !== "undefined" ? createPortal(vipTutorEditModalLayer, document.body) : null}
    </>
  );
}

export default ProfileMainContent;
