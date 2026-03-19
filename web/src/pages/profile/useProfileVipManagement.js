import { useEffect, useMemo, useState } from "react";
import { apiFetch, readApiResponseData } from "../../lib/api.js";
import { sortVipClassDailyRoutineRows } from "./profile.helpers.js";
import {
  MY_CHILDREN_DEFAULT_VISIBLE_WEEK_DAYS,
  normalizeVipAttendanceStatus,
  normalizeVipDailyRoutineActivityType,
  normalizeMyChildrenVisibleWeekDays
} from "./profile.vip-utils.js";

function formatVipDailyRoutineClassLabel(item) {
  const classId = String(item?.id || item?.classId || item?.class_id || "").trim();
  const className = String(item?.className || item?.class_name || "").trim();
  const teacherName = String(item?.teacherName || item?.teacher_name || "").trim();
  const fullName = className
    ? (teacherName ? `${className} (${teacherName})` : className)
    : "";
  return {
    id: classId,
    label: fullName || (classId ? `Class #${classId}` : "Class")
  };
}

function alertMessage(message) {
  const normalizedMessage = String(message || "").trim();
  if (!normalizedMessage) {
    return;
  }
  if (typeof window !== "undefined" && typeof window.alert === "function") {
    window.alert(normalizedMessage);
  }
}

export default function useProfileVipManagement({
  mainView,
  isVipAttendancePanelView,
  vipAttendanceItems,
  vipDailyRoutineItems,
  vipDailyRoutineClasses,
  vipDailyRoutineSpecialists,
  vipClassTeachers,
  vipClassItems,
  vipAssignmentClasses,
  vipAssignmentTutors,
  saveVipAttendanceAbsentReason,
  saveVipAttendanceEdit,
  saveVipDailyRoutine,
  deleteVipDailyRoutine,
  saveVipClassAssignment,
  deleteVipClassAssignment,
  saveVipAssignment,
  maxAbsentReasonLength,
  maxEditNoteLength,
  vipDailyRoutineNoteMaxLength,
  vipDailyRoutineMandatoryExercisesMaxLength
}) {
  const [vipAttendanceFilter, setVipAttendanceFilter] = useState("all");
  const [vipAttendanceClassFilter, setVipAttendanceClassFilter] = useState("all");
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
    status: "unmarked",
    arrivalTime: "",
    departureTime: "",
    note: "",
    error: ""
  });
  const [vipAttendanceEditSaving, setVipAttendanceEditSaving] = useState(false);
  const [vipAttendanceEditAction, setVipAttendanceEditAction] = useState("save");
  const [vipDailyRoutineEditModal, setVipDailyRoutineEditModal] = useState({
    open: false,
    id: "",
    classId: "",
    dayOfWeek: [],
    activityType: "lesson",
    startTime: "",
    endTime: "",
    mandatoryExercises: "",
    note: "",
    error: ""
  });
  const [vipDailyRoutineEditSaving, setVipDailyRoutineEditSaving] = useState(false);
  const [vipDailyRoutineDeleteModal, setVipDailyRoutineDeleteModal] = useState({
    open: false,
    id: ""
  });
  const [vipDailyRoutineDeleteSaving, setVipDailyRoutineDeleteSaving] = useState(false);
  const [vipDailyRoutineVisibleWeekDays, setVipDailyRoutineVisibleWeekDays] = useState(
    () => [...MY_CHILDREN_DEFAULT_VISIBLE_WEEK_DAYS]
  );
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
    const message = String(vipAttendanceAbsentModal.error || "").trim();
    if (!message) {
      return;
    }
    alertMessage(message);
    setVipAttendanceAbsentModal((prev) => ({ ...prev, error: "" }));
  }, [vipAttendanceAbsentModal.error]);

  useEffect(() => {
    const message = String(vipAttendanceEditModal.error || "").trim();
    if (!message) {
      return;
    }
    alertMessage(message);
    setVipAttendanceEditModal((prev) => ({ ...prev, error: "" }));
  }, [vipAttendanceEditModal.error]);

  useEffect(() => {
    const message = String(vipClassDeleteModal.error || "").trim();
    if (!message) {
      return;
    }
    alertMessage(message);
    setVipClassDeleteModal((prev) => ({ ...prev, error: "" }));
  }, [vipClassDeleteModal.error]);

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
    if (mainView === "appointment-vip-daily-routines") {
      return;
    }
    setVipDailyRoutineEditModal({
      open: false,
      id: "",
      classId: "",
      specialistId: "",
      dayOfWeek: [],
      activityType: "lesson",
      startTime: "",
      endTime: "",
      mandatoryExercises: "",
      note: "",
      error: ""
    });
    setVipDailyRoutineEditSaving(false);
    setVipDailyRoutineDeleteModal({
      open: false,
      id: ""
    });
    setVipDailyRoutineDeleteSaving(false);
  }, [mainView]);

  useEffect(() => {
    if (mainView !== "appointment-vip-daily-routines") {
      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        const response = await apiFetch("/api/appointments/settings", {
          method: "GET",
          cache: "no-store"
        });
        const data = await readApiResponseData(response);
        if (cancelled) {
          return;
        }
        if (!response.ok) {
          setVipDailyRoutineVisibleWeekDays([...MY_CHILDREN_DEFAULT_VISIBLE_WEEK_DAYS]);
          return;
        }
        setVipDailyRoutineVisibleWeekDays(
          normalizeMyChildrenVisibleWeekDays(data?.item?.visibleWeekDays)
        );
      } catch {
        if (!cancelled) {
          setVipDailyRoutineVisibleWeekDays([...MY_CHILDREN_DEFAULT_VISIBLE_WEEK_DAYS]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mainView]);

  useEffect(() => {
    if (!isVipAttendancePanelView && (vipAttendanceAbsentModal.open || vipAttendanceEditModal.open)) {
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
        status: "unmarked",
        arrivalTime: "",
        departureTime: "",
        note: "",
        error: ""
      });
      setVipAttendanceEditSaving(false);
      setVipAttendanceEditAction("save");
    }
  }, [isVipAttendancePanelView, vipAttendanceAbsentModal.open, vipAttendanceEditModal.open]);

  useEffect(() => {
    const normalizedClassName = String(vipAttendanceClassFilter || "").trim();
    if (!normalizedClassName || normalizedClassName === "all") {
      return;
    }
    const existsInList = vipAttendanceItems.some((item) => String(item?.className || item?.class_name || "").trim() === normalizedClassName);
    if (!existsInList) {
      setVipAttendanceClassFilter("all");
    }
  }, [vipAttendanceClassFilter, vipAttendanceItems]);

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
      status: "unmarked",
      arrivalTime: "",
      departureTime: "",
      note: "",
      error: ""
    });
    setVipAttendanceEditSaving(false);
    setVipAttendanceEditAction("save");
  }

  function setVipAttendanceEditModalError(message) {
    const normalizedMessage = String(message || "").trim();
    setVipAttendanceEditModal((prev) => ({ ...prev, error: normalizedMessage }));
  }

  function setVipDailyRoutineModalError(message) {
    const normalizedMessage = String(message || "").trim();
    setVipDailyRoutineEditModal((prev) => ({ ...prev, error: normalizedMessage }));
    alertMessage(normalizedMessage);
  }

  function setVipClassModalError(message) {
    const normalizedMessage = String(message || "").trim();
    setVipClassFormError(normalizedMessage);
    alertMessage(normalizedMessage);
  }

  function setVipTutorModalError(message) {
    const normalizedMessage = String(message || "").trim();
    setVipTutorEditModal((prev) => ({ ...prev, error: normalizedMessage }));
    alertMessage(normalizedMessage);
  }

  function openVipAttendanceAbsentModal(clientId, currentReason) {
    const normalizedClientId = String(clientId || "").trim();
    if (!normalizedClientId) {
      return;
    }
    setVipAttendanceAbsentSaving(false);
    setVipAttendanceAbsentModal({
      open: true,
      clientId: normalizedClientId,
      reason: String(currentReason || "").trim().slice(0, maxAbsentReasonLength),
      error: ""
    });
  }

  function openVipAttendanceEditModal(clientId, {
    status = "",
    arrivedAt = "",
    leftAt = "",
    note = ""
  } = {}) {
    const normalizedClientId = String(clientId || "").trim();
    if (!normalizedClientId) {
      return;
    }
    const normalizedStatus = normalizeVipAttendanceStatus(status);
    const isPresentMode = normalizedStatus === "present";
    const isAbsentMode = normalizedStatus === "absent";
    setVipAttendanceEditSaving(false);
    setVipAttendanceEditAction("save");
    setVipAttendanceEditModal({
      open: true,
      clientId: normalizedClientId,
      status: normalizedStatus,
      arrivalTime: isAbsentMode ? "" : String(arrivedAt || "").trim(),
      departureTime: isAbsentMode ? "" : String(leftAt || "").trim(),
      note: isPresentMode ? "" : String(note || "").trim().slice(0, maxEditNoteLength),
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
    if (normalizedReason.length > maxAbsentReasonLength) {
      setVipAttendanceAbsentModal((prev) => ({ ...prev, error: `Reason is too long (max ${maxAbsentReasonLength}).` }));
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
    const normalizedStatus = normalizeVipAttendanceStatus(vipAttendanceEditModal.status);
    const isPresentMode = normalizedStatus === "present";
    const isAbsentMode = normalizedStatus === "absent";
    const normalizedArrivalTime = String(vipAttendanceEditModal.arrivalTime || "").trim();
    const normalizedDepartureTime = String(vipAttendanceEditModal.departureTime || "").trim();
    const normalizedNote = String(vipAttendanceEditModal.note || "").trim();

    if (!isAbsentMode && normalizedDepartureTime && !normalizedArrivalTime) {
      setVipAttendanceEditModalError("Arrival time is required when departure time is set.");
      return;
    }
    if (!isAbsentMode && normalizedArrivalTime && normalizedDepartureTime && normalizedDepartureTime < normalizedArrivalTime) {
      setVipAttendanceEditModalError("Departure time must be later than arrival time.");
      return;
    }
    if (!isPresentMode && normalizedNote.length > maxEditNoteLength) {
      setVipAttendanceEditModalError(`Note is too long (max ${maxEditNoteLength}).`);
      return;
    }
    if (isAbsentMode && !normalizedNote) {
      setVipAttendanceEditModalError("Reason is required for absent.");
      return;
    }

    setVipAttendanceEditAction("save");
    setVipAttendanceEditSaving(true);
    const saveResult = await saveVipAttendanceEdit(normalizedClientId, {
      status: normalizedStatus,
      arrivedAt: isAbsentMode ? "" : normalizedArrivalTime,
      leftAt: isAbsentMode ? "" : normalizedDepartureTime,
      note: isPresentMode ? "" : normalizedNote
    });
    if (!saveResult?.ok) {
      setVipAttendanceEditModalError(String(saveResult?.message || "Failed to save VIP attendance.").trim());
      setVipAttendanceEditSaving(false);
      return;
    }
    closeVipAttendanceEditModal();
  }

  async function handleVipAttendanceEditDelete() {
    const normalizedClientId = String(vipAttendanceEditModal.clientId || "").trim();
    if (!normalizedClientId) {
      closeVipAttendanceEditModal();
      return;
    }
    setVipAttendanceEditAction("delete");
    setVipAttendanceEditSaving(true);
    const resetResult = await saveVipAttendanceEdit(normalizedClientId, { reset: true });
    if (!resetResult?.ok) {
      setVipAttendanceEditModalError(String(resetResult?.message || "Failed to reset VIP attendance.").trim());
      setVipAttendanceEditSaving(false);
      setVipAttendanceEditAction("save");
      return;
    }
    closeVipAttendanceEditModal();
  }

  const vipClassTeacherOptions = (Array.isArray(vipClassTeachers) ? vipClassTeachers : [])
    .map((item) => ({
      value: String(item?.id || "").trim(),
      label: String(item?.name || "").trim() || `Educator #${String(item?.id || "").trim()}`
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

  const vipDailyRoutineClassOptions = (Array.isArray(vipDailyRoutineClasses) ? vipDailyRoutineClasses : [])
    .map((item) => {
      const formatted = formatVipDailyRoutineClassLabel(item);
      if (!formatted.id) {
        return null;
      }
      return {
        value: formatted.id,
        label: formatted.label
      };
    })
    .filter(Boolean);
  const vipDailyRoutineSpecialistOptions = useMemo(() => {
    const selectedClassId = String(vipDailyRoutineEditModal.classId || "").trim();
    const items = (Array.isArray(vipDailyRoutineSpecialists) ? vipDailyRoutineSpecialists : [])
      .filter((item) => String(item?.classId || "").trim() === selectedClassId)
      .map((item) => {
        const specialistId = String(item?.specialistId || "").trim();
        const specialistName = String(item?.specialistName || "").trim();
        const specialistRole = String(item?.specialistRole || "").trim();
        if (!specialistId) {
          return null;
        }
        return {
          value: specialistId,
          label: specialistRole ? `${specialistName || `Specialist #${specialistId}`} (${specialistRole})` : (specialistName || `Specialist #${specialistId}`)
        };
      })
      .filter(Boolean);
    const seen = new Set();
    return items.filter((item) => {
      if (!item?.value || seen.has(item.value)) {
        return false;
      }
      seen.add(item.value);
      return true;
    });
  }, [vipDailyRoutineEditModal.classId, vipDailyRoutineSpecialists]);

  const vipDailyRoutineRows = sortVipClassDailyRoutineRows(vipDailyRoutineItems);

  useEffect(() => {
    if (!vipDailyRoutineEditModal.open) {
      return;
    }
    const selectedSpecialistId = String(vipDailyRoutineEditModal.specialistId || "").trim();
    const fallbackSpecialistId = String(vipDailyRoutineSpecialistOptions[0]?.value || "").trim();
    const specialistStillAvailable = vipDailyRoutineSpecialistOptions.some((item) => item.value === selectedSpecialistId);
    if ((selectedSpecialistId && specialistStillAvailable) || (!selectedSpecialistId && !fallbackSpecialistId)) {
      return;
    }
    setVipDailyRoutineEditModal((prev) => ({
      ...prev,
      specialistId: specialistStillAvailable ? selectedSpecialistId : fallbackSpecialistId
    }));
  }, [
    vipDailyRoutineEditModal.open,
    vipDailyRoutineEditModal.specialistId,
    vipDailyRoutineSpecialistOptions
  ]);

  function openVipDailyRoutineAddModal() {
    const preferredClassId = String(vipDailyRoutineClassOptions[0]?.value || "").trim();
    const preferredSpecialistId = String(
      (Array.isArray(vipDailyRoutineSpecialists) ? vipDailyRoutineSpecialists : [])
        .find((item) => String(item?.classId || "").trim() === preferredClassId)?.specialistId || ""
    ).trim();
    setVipDailyRoutineEditModal({
      open: true,
      id: "",
      classId: preferredClassId,
      specialistId: preferredSpecialistId,
      dayOfWeek: [],
      activityType: "lesson",
      startTime: "",
      endTime: "",
      mandatoryExercises: "",
      note: "",
      error: ""
    });
    setVipDailyRoutineEditSaving(false);
  }

  function openVipDailyRoutineEditModal(row) {
    const routineId = String(row?.id || "").trim();
    if (!routineId) {
      return;
    }
    setVipDailyRoutineEditModal({
      open: true,
      id: routineId,
      classId: String(row?.classId || "").trim(),
      specialistId: String(row?.specialistId || "").trim(),
      dayOfWeek: [String(row?.dayOfWeek || "").trim() || "1"],
      activityType: normalizeVipDailyRoutineActivityType(row?.activityType) || "lesson",
      startTime: String(row?.startTime || "").trim(),
      endTime: String(row?.endTime || "").trim(),
      mandatoryExercises: String(row?.mandatoryExercises || "").trim(),
      note: String(row?.note || "").trim(),
      error: ""
    });
    setVipDailyRoutineEditSaving(false);
  }

  function closeVipDailyRoutineEditModal() {
    setVipDailyRoutineEditModal({
      open: false,
      id: "",
      classId: "",
      specialistId: "",
      dayOfWeek: [],
      activityType: "lesson",
      startTime: "",
      endTime: "",
      mandatoryExercises: "",
      note: "",
      error: ""
    });
    setVipDailyRoutineEditSaving(false);
  }

  function openVipDailyRoutineDeleteModal(row) {
    const routineId = String(row?.id || "").trim();
    if (!routineId) {
      return;
    }
    setVipDailyRoutineDeleteModal({
      open: true,
      id: routineId
    });
    setVipDailyRoutineDeleteSaving(false);
  }

  function closeVipDailyRoutineDeleteModal() {
    setVipDailyRoutineDeleteModal({
      open: false,
      id: ""
    });
    setVipDailyRoutineDeleteSaving(false);
  }

  async function handleVipDailyRoutineSave() {
    const routineId = String(vipDailyRoutineEditModal.id || "").trim();
    const isEditMode = Boolean(routineId);
    const classId = String(vipDailyRoutineEditModal.classId || "").trim();
    const specialistId = String(vipDailyRoutineEditModal.specialistId || "").trim();
    const daysArray = Array.isArray(vipDailyRoutineEditModal.dayOfWeek)
      ? vipDailyRoutineEditModal.dayOfWeek.filter((d) => /^[1-7]$/.test(d))
      : [];
    const activityType = normalizeVipDailyRoutineActivityType(vipDailyRoutineEditModal.activityType);
    const startTime = String(vipDailyRoutineEditModal.startTime || "").trim();
    const endTime = String(vipDailyRoutineEditModal.endTime || "").trim();
    const mandatoryExercises = String(vipDailyRoutineEditModal.mandatoryExercises || "").trim();
    const note = String(vipDailyRoutineEditModal.note || "").trim();

    if (!classId) {
      setVipDailyRoutineModalError("Class is required.");
      return;
    }
    if (!specialistId) {
      setVipDailyRoutineModalError("Specialist is required.");
      return;
    }
    if (daysArray.length === 0) {
      setVipDailyRoutineModalError("At least one day must be selected.");
      return;
    }
    if (!activityType) {
      setVipDailyRoutineModalError("Activity is required.");
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
      setVipDailyRoutineModalError("Start and end time must be HH:mm.");
      return;
    }
    if (endTime <= startTime) {
      setVipDailyRoutineModalError("End time must be later than start time.");
      return;
    }
    if (mandatoryExercises.length > vipDailyRoutineMandatoryExercisesMaxLength) {
      setVipDailyRoutineModalError(
        `Mandatory exercises are too long (max ${vipDailyRoutineMandatoryExercisesMaxLength}).`
      );
      return;
    }
    if (note.length > vipDailyRoutineNoteMaxLength) {
      setVipDailyRoutineModalError(`Note is too long (max ${vipDailyRoutineNoteMaxLength}).`);
      return;
    }

    setVipDailyRoutineEditSaving(true);
    if (isEditMode) {
      const saveResult = await saveVipDailyRoutine({
        id: routineId,
        classId,
        specialistId,
        dayOfWeek: Number.parseInt(daysArray[0], 10),
        activityType,
        startTime,
        endTime,
        mandatoryExercises,
        note
      });
      if (!saveResult?.ok) {
        setVipDailyRoutineModalError(saveResult?.message || "Failed to save routine.");
        setVipDailyRoutineEditSaving(false);
        return;
      }
    } else {
      for (const day of daysArray) {
        const saveResult = await saveVipDailyRoutine({
          id: "",
          classId,
          specialistId,
          dayOfWeek: Number.parseInt(day, 10),
          activityType,
          startTime,
          endTime,
          mandatoryExercises,
          note
        });
        if (!saveResult?.ok) {
          setVipDailyRoutineModalError(saveResult?.message || "Failed to save routine.");
          setVipDailyRoutineEditSaving(false);
          return;
        }
      }
    }
    closeVipDailyRoutineEditModal();
  }

  async function confirmVipDailyRoutineDelete() {
    const routineId = String(vipDailyRoutineDeleteModal.id || "").trim();
    if (!routineId) {
      closeVipDailyRoutineDeleteModal();
      return;
    }
    setVipDailyRoutineDeleteSaving(true);
    const result = await deleteVipDailyRoutine(routineId);
    if (!result?.ok) {
      alertMessage(result?.message || "Failed to delete routine.");
      setVipDailyRoutineDeleteSaving(false);
      return;
    }
    closeVipDailyRoutineDeleteModal();
  }

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
      setVipClassModalError("Class name is required.");
      return;
    }
    if (className.length > 64) {
      setVipClassModalError("Class name is too long (max 64).");
      return;
    }
    if (!teacherId) {
      setVipClassModalError("Educator is required.");
      return;
    }
    setVipClassModalSaving(true);
    const result = await saveVipClassAssignment({
      classId: classId || null,
      className,
      teacherId
    });
    if (!result?.ok) {
      setVipClassModalError(result?.message || "Failed to save class assignment.");
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
      setVipTutorModalError("Class is required.");
      return;
    }
    if (!tutorId) {
      setVipTutorModalError("Tutor is required.");
      return;
    }
    setVipTutorEditSaving(true);
    const saveResult = await saveVipAssignment(clientId, {
      classId,
      tutorId
    });
    if (!saveResult?.ok) {
      setVipTutorModalError(saveResult?.message || "Failed to save tutor assignment.");
      setVipTutorEditSaving(false);
      return;
    }
    closeVipTutorEditModal();
  }

  return {
    vipAttendanceFilter,
    setVipAttendanceFilter,
    vipAttendanceClassFilter,
    setVipAttendanceClassFilter,
    vipAttendanceAbsentModal,
    setVipAttendanceAbsentModal,
    vipAttendanceAbsentSaving,
    vipAttendanceEditModal,
    setVipAttendanceEditModal,
    vipAttendanceEditSaving,
    vipAttendanceEditAction,
    vipDailyRoutineEditModal,
    setVipDailyRoutineEditModal,
    vipDailyRoutineEditSaving,
    vipDailyRoutineDeleteModal,
    vipDailyRoutineDeleteSaving,
    vipClassDraft,
    setVipClassDraft,
    vipClassFormError,
    setVipClassFormError,
    vipClassAddModalOpen,
    vipClassModalMode,
    vipClassModalSaving,
    vipClassDeleteModal,
    vipClassDeleteSaving,
    vipTutorEditModal,
    setVipTutorEditModal,
    vipTutorEditSaving,
    vipClassTeacherOptions,
    vipClassRows,
    vipAssignmentClassOptions,
    vipAssignmentTutorOptions,
    vipDailyRoutineClassOptions,
    vipDailyRoutineSpecialistOptions,
    vipDailyRoutineVisibleWeekDays,
    vipDailyRoutineRows,
    openVipAttendanceAbsentModal,
    closeVipAttendanceAbsentModal,
    openVipAttendanceEditModal,
    closeVipAttendanceEditModal,
    handleVipAttendanceAbsentReasonSave,
    handleVipAttendanceEditSave,
    handleVipAttendanceEditDelete,
    openVipDailyRoutineAddModal,
    openVipDailyRoutineEditModal,
    closeVipDailyRoutineEditModal,
    openVipDailyRoutineDeleteModal,
    closeVipDailyRoutineDeleteModal,
    handleVipDailyRoutineSave,
    confirmVipDailyRoutineDelete,
    openVipClassAddModal,
    openVipClassEditModal,
    closeVipClassAddModal,
    openVipClassDeleteModal,
    closeVipClassDeleteModal,
    handleVipClassSave,
    confirmVipClassDelete,
    openVipTutorEditModal,
    closeVipTutorEditModal,
    handleVipTutorEditSave
  };
}
