import { useCallback, useState } from "react";
import { apiFetch, getApiErrorMessage, readApiResponseData } from "../../lib/api.js";
import { handleProtectedStatus } from "./profile.helpers.js";
import {
  mapVipAssignmentItem,
  mapVipClassItem,
  normalizeVipAssignmentDraftEntry
} from "./profile.vip-utils.js";

export function useProfileVipAssignments({
  canReadAppointmentVipClassAssignments,
  canCreateAppointmentVipClassAssignments,
  canUpdateAppointmentVipClassAssignments,
  canDeleteAppointmentVipClassAssignments,
  canReadAppointmentVipTutorAssignments,
  canCreateAppointmentVipTutorAssignments,
  canUpdateAppointmentVipTutorAssignments,
  navigate
}) {
  const [vipClassItems, setVipClassItems] = useState([]);
  const [vipClassTeachers, setVipClassTeachers] = useState([]);
  const [vipClassMessage, setVipClassMessage] = useState("");
  const [vipClassLoading, setVipClassLoading] = useState(false);
  const [vipClassSavingById, setVipClassSavingById] = useState({});
  const [vipAssignmentItems, setVipAssignmentItems] = useState([]);
  const [vipAssignmentDraftByClientId, setVipAssignmentDraftByClientId] = useState({});
  const [vipAssignmentClasses, setVipAssignmentClasses] = useState([]);
  const [vipAssignmentTutors, setVipAssignmentTutors] = useState([]);
  const [vipAssignmentMessage, setVipAssignmentMessage] = useState("");
  const [vipAssignmentLoading, setVipAssignmentLoading] = useState(false);
  const [vipAssignmentSavingByClientId, setVipAssignmentSavingByClientId] = useState({});

  const loadVipClassAssignments = useCallback(async () => {
    if (!canReadAppointmentVipClassAssignments) {
      setVipClassItems([]);
      setVipClassTeachers([]);
      setVipClassMessage("You do not have permission to manage VIP class assignments.");
      return;
    }

    setVipClassLoading(true);
    setVipClassMessage("");
    try {
      const query = new URLSearchParams({
        limit: "300"
      });
      const response = await apiFetch(`/api/clients/vip-class-assignments?${query.toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setVipClassItems([]);
        setVipClassTeachers([]);
        setVipClassMessage(data?.message || "Failed to load class assignments.");
        return;
      }

      const nextItems = (Array.isArray(data?.items) ? data.items : [])
        .map((item) => mapVipClassItem(item))
        .filter((item) => Boolean(item.id))
        .sort((a, b) => (
          String(a.className || "").localeCompare(
            String(b.className || ""),
            undefined,
            { sensitivity: "base" }
          )
        ));
      const nextTeachers = (Array.isArray(data?.teachers) ? data.teachers : [])
        .map((item) => ({
          id: String(item?.id || "").trim(),
          name: String(item?.name || "").trim()
        }))
        .filter((item) => Boolean(item.id));

      setVipClassItems(nextItems);
      setVipClassTeachers(nextTeachers);
      setVipAssignmentClasses(nextItems.map((item) => ({
        id: String(item.id || "").trim(),
        className: String(item.className || "").trim(),
        teacherId: String(item.teacherId || "").trim(),
        teacherName: String(item.teacherName || "").trim()
      })));
    } catch {
      setVipClassItems([]);
      setVipClassTeachers([]);
      setVipClassMessage("Failed to load class assignments.");
    } finally {
      setVipClassLoading(false);
    }
  }, [canReadAppointmentVipClassAssignments, navigate]);

  const saveVipClassAssignment = useCallback(async ({
    classId = "",
    className = "",
    teacherId = ""
  } = {}) => {
    const normalizedClassId = String(classId || "").trim();
    const normalizedClassName = String(className || "").trim();
    const normalizedTeacherId = String(teacherId || "").trim();
    const isEditMode = Boolean(normalizedClassId);

    if (isEditMode && !canUpdateAppointmentVipClassAssignments) {
      const message = "You do not have permission to update class assignments.";
      setVipClassMessage(message);
      return { ok: false, message };
    }
    if (!isEditMode && !canCreateAppointmentVipClassAssignments) {
      const message = "You do not have permission to create class assignments.";
      setVipClassMessage(message);
      return { ok: false, message };
    }

    if (!normalizedClassName) {
      const message = "Class name is required.";
      setVipClassMessage(message);
      return { ok: false, message };
    }
    if (normalizedClassName.length > 64) {
      const message = "Class name is too long (max 64).";
      setVipClassMessage(message);
      return { ok: false, message };
    }
    if (!normalizedTeacherId) {
      const message = "Educator is required.";
      setVipClassMessage(message);
      return { ok: false, message };
    }

    const savingKey = normalizedClassId || "__new__";
    setVipClassSavingById((prev) => ({ ...prev, [savingKey]: true }));
    setVipClassMessage("");

    try {
      const response = await apiFetch("/api/clients/vip-class-assignments", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          classId: normalizedClassId || null,
          className: normalizedClassName,
          teacherId: normalizedTeacherId
        })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return { ok: false, message: "Unauthorized." };
        }
        const message = getApiErrorMessage(response, data, "Failed to save class assignment.");
        setVipClassMessage(message);
        return { ok: false, message };
      }

      const item = mapVipClassItem(data?.item || {});
      setVipClassItems((prev) => {
        const filtered = prev.filter((row) => String(row?.id || "") !== String(item.id || ""));
        filtered.push(item);
        filtered.sort((a, b) => (
          String(a.className || "").localeCompare(
            String(b.className || ""),
            undefined,
            { sensitivity: "base" }
          )
        ));
        return filtered;
      });
      setVipAssignmentClasses((prev) => {
        const filtered = prev.filter((row) => String(row?.id || "") !== String(item.id || ""));
        filtered.push({
          id: String(item.id || ""),
          className: String(item.className || ""),
          teacherId: String(item.teacherId || ""),
          teacherName: String(item.teacherName || "")
        });
        filtered.sort((a, b) => (
          String(a.className || "").localeCompare(
            String(b.className || ""),
            undefined,
            { sensitivity: "base" }
          )
        ));
        return filtered;
      });

      return { ok: true, item };
    } catch {
      const message = "Failed to save class assignment.";
      setVipClassMessage(message);
      return { ok: false, message };
    } finally {
      setVipClassSavingById((prev) => {
        if (!Object.prototype.hasOwnProperty.call(prev, savingKey)) {
          return prev;
        }
        const next = { ...prev };
        delete next[savingKey];
        return next;
      });
    }
  }, [
    canCreateAppointmentVipClassAssignments,
    canUpdateAppointmentVipClassAssignments,
    navigate
  ]);

  const deleteVipClassAssignment = useCallback(async (classId) => {
    const normalizedClassId = String(classId || "").trim();
    if (!normalizedClassId) {
      return { ok: false, message: "Class is required." };
    }
    if (!canDeleteAppointmentVipClassAssignments) {
      return { ok: false, message: "You do not have permission to delete class assignments." };
    }

    setVipClassSavingById((prev) => ({ ...prev, [normalizedClassId]: true }));
    setVipClassMessage("");
    try {
      const response = await apiFetch(
        `/api/clients/vip-class-assignments/${encodeURIComponent(normalizedClassId)}`,
        { method: "DELETE" }
      );
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return { ok: false, message: "Unauthorized." };
        }
        const message = getApiErrorMessage(response, data, "Failed to delete class assignment.");
        setVipClassMessage(message);
        return { ok: false, message };
      }
      setVipClassItems((prev) => prev.filter((row) => String(row?.id || "") !== normalizedClassId));
      setVipAssignmentClasses((prev) => prev.filter((row) => String(row?.id || "") !== normalizedClassId));
      return { ok: true };
    } catch {
      const message = "Failed to delete class assignment.";
      setVipClassMessage(message);
      return { ok: false, message };
    } finally {
      setVipClassSavingById((prev) => {
        if (!Object.prototype.hasOwnProperty.call(prev, normalizedClassId)) {
          return prev;
        }
        const next = { ...prev };
        delete next[normalizedClassId];
        return next;
      });
    }
  }, [canDeleteAppointmentVipClassAssignments, navigate]);

  const loadVipAssignments = useCallback(async () => {
    if (!canReadAppointmentVipTutorAssignments) {
      setVipAssignmentItems([]);
      setVipAssignmentDraftByClientId({});
      setVipAssignmentClasses([]);
      setVipAssignmentTutors([]);
      setVipAssignmentMessage("You do not have permission to manage VIP tutor assignments.");
      return;
    }

    setVipAssignmentLoading(true);
    setVipAssignmentMessage("");
    try {
      const query = new URLSearchParams({
        limit: "300"
      });
      const response = await apiFetch(`/api/clients/vip-tutor-assignments?${query.toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setVipAssignmentItems([]);
        setVipAssignmentDraftByClientId({});
        setVipAssignmentClasses([]);
        setVipAssignmentTutors([]);
        setVipAssignmentMessage(data?.message || "Failed to load VIP tutor assignments.");
        return;
      }

      const nextItems = (Array.isArray(data?.items) ? data.items : [])
        .map((item) => mapVipAssignmentItem(item))
        .filter((item) => Boolean(item.id))
        .sort((a, b) => {
          const nameA = `${a.firstName} ${a.lastName} ${a.middleName}`.trim();
          const nameB = `${b.firstName} ${b.lastName} ${b.middleName}`.trim();
          return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
        });
      const nextClasses = (Array.isArray(data?.classes) ? data.classes : [])
        .map((item) => ({
          id: String(item?.id || "").trim(),
          className: String(item?.className || item?.class_name || "").trim(),
          teacherId: String(item?.teacherId || item?.teacher_id || "").trim(),
          teacherName: String(item?.teacherName || item?.teacher_name || "").trim()
        }))
        .filter((item) => Boolean(item.id));
      const nextTutors = (Array.isArray(data?.tutors) ? data.tutors : [])
        .map((item) => ({
          id: String(item?.id || "").trim(),
          name: String(item?.name || "").trim()
        }))
        .filter((item) => Boolean(item.id));

      setVipAssignmentItems(nextItems);
      setVipAssignmentClasses(nextClasses);
      setVipAssignmentTutors(nextTutors);
      setVipAssignmentDraftByClientId((prev) => {
        const next = {};
        nextItems.forEach((item) => {
          const previous = normalizeVipAssignmentDraftEntry(prev[item.id]);
          const source = item.classId || item.tutorId
            ? {
                classId: item.classId,
                tutorId: item.tutorId
              }
            : previous;
          next[item.id] = normalizeVipAssignmentDraftEntry(source);
        });
        return next;
      });
      if (nextItems.length === 0) {
        setVipAssignmentMessage("");
      }
    } catch {
      setVipAssignmentItems([]);
      setVipAssignmentDraftByClientId({});
      setVipAssignmentClasses([]);
      setVipAssignmentTutors([]);
      setVipAssignmentMessage("Failed to load VIP tutor assignments.");
    } finally {
      setVipAssignmentLoading(false);
    }
  }, [canReadAppointmentVipTutorAssignments, navigate]);

  const saveVipAssignment = useCallback(async (clientId, {
    classId = "",
    tutorId = ""
  } = {}) => {
    if (!canCreateAppointmentVipTutorAssignments && !canUpdateAppointmentVipTutorAssignments) {
      const message = "You do not have permission to save VIP tutor assignments.";
      setVipAssignmentMessage(message);
      return { ok: false, message };
    }
    const normalizedClientId = String(clientId || "").trim();
    if (!normalizedClientId) {
      const message = "Client is required.";
      setVipAssignmentMessage(message);
      return { ok: false, message };
    }
    const normalizedClassId = String(classId || "").trim();
    const normalizedTutorId = String(tutorId || "").trim();
    if (!normalizedClassId) {
      const message = "Class is required.";
      setVipAssignmentMessage(message);
      return { ok: false, message };
    }
    if (!normalizedTutorId) {
      const message = "Tutor is required.";
      setVipAssignmentMessage(message);
      return { ok: false, message };
    }

    setVipAssignmentSavingByClientId((prev) => ({ ...prev, [normalizedClientId]: true }));
    setVipAssignmentMessage("");
    try {
      const response = await apiFetch("/api/clients/vip-tutor-assignments", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          clientId: normalizedClientId,
          classId: normalizedClassId,
          tutorId: normalizedTutorId
        })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return { ok: false, message: "Unauthorized." };
        }
        const message = getApiErrorMessage(response, data, "Failed to save VIP tutor assignment.");
        setVipAssignmentMessage(message);
        return { ok: false, message };
      }

      const item = mapVipAssignmentItem(data?.item || {});
      setVipAssignmentItems((prev) => prev.map((row) => {
        if (String(row?.id || "") !== normalizedClientId) {
          return row;
        }
        return {
          ...row,
          classId: item.classId || normalizedClassId,
          className: item.className || row.className,
          teacherId: item.teacherId || row.teacherId,
          teacherName: item.teacherName || row.teacherName,
          tutorId: item.tutorId || normalizedTutorId,
          tutorName: item.tutorName || row.tutorName,
          updatedBy: item.updatedBy || row.updatedBy,
          updatedAt: item.updatedAt || row.updatedAt
        };
      }));
      setVipAssignmentDraftByClientId((prev) => ({
        ...prev,
        [normalizedClientId]: {
          classId: item.classId || normalizedClassId,
          tutorId: item.tutorId || normalizedTutorId
        }
      }));
      return { ok: true };
    } catch {
      const message = "Failed to save VIP tutor assignment.";
      setVipAssignmentMessage(message);
      return { ok: false, message };
    } finally {
      setVipAssignmentSavingByClientId((prev) => {
        if (!Object.prototype.hasOwnProperty.call(prev, normalizedClientId)) {
          return prev;
        }
        const next = { ...prev };
        delete next[normalizedClientId];
        return next;
      });
    }
  }, [
    canCreateAppointmentVipTutorAssignments,
    canUpdateAppointmentVipTutorAssignments,
    navigate
  ]);

  return {
    vipClassItems,
    vipClassTeachers,
    vipClassMessage,
    vipClassLoading,
    vipClassSavingById,
    vipAssignmentItems,
    vipAssignmentDraftByClientId,
    vipAssignmentClasses,
    vipAssignmentTutors,
    vipAssignmentMessage,
    vipAssignmentLoading,
    vipAssignmentSavingByClientId,
    loadVipClassAssignments,
    saveVipClassAssignment,
    deleteVipClassAssignment,
    loadVipAssignments,
    saveVipAssignment
  };
}
