import { useCallback, useEffect, useState } from "react";
import { apiFetch, readApiResponseData } from "../../lib/api.js";
import { handleProtectedStatus } from "./profile.helpers.js";

function normalizeSpecialistItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      id: String(item?.id || "").trim(),
      name: String(item?.name || "").trim()
    }))
    .filter((item) => Boolean(item.id));
}

export function useVipNormMonitoringSection({
  mainView,
  canOpenAppointmentVipNormMonitoring,
  navigate
}) {
  const [vipNormMonitoringItems, setVipNormMonitoringItems] = useState([]);
  const [vipNormMonitoringFilters, setVipNormMonitoringFilters] = useState({
    clients: [],
    classes: [],
    positions: [],
    specialists: []
  });
  const [vipNormMonitoringMessage, setVipNormMonitoringMessage] = useState("");
  const [vipNormMonitoringLoading, setVipNormMonitoringLoading] = useState(false);

  const loadVipNormMonitoring = useCallback(async () => {
    if (!canOpenAppointmentVipNormMonitoring) {
      setVipNormMonitoringItems([]);
      setVipNormMonitoringFilters({
        clients: [],
        classes: [],
        positions: [],
        specialists: []
      });
      setVipNormMonitoringMessage("You do not have permission to view VIP norm monitoring.");
      return;
    }

    setVipNormMonitoringLoading(true);
    setVipNormMonitoringMessage("");
    try {
      const response = await apiFetch("/api/clients/vip-norm-monitoring", {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setVipNormMonitoringItems([]);
        setVipNormMonitoringFilters({
          clients: [],
          classes: [],
          positions: [],
          specialists: []
        });
        setVipNormMonitoringMessage(data?.message || "Failed to load VIP norm monitoring.");
        return;
      }

      const nextItems = (Array.isArray(data?.items) ? data.items : [])
        .map((item) => ({
          id: String(item?.id || "").trim(),
          clientId: String(item?.clientId || item?.client_id || "").trim(),
          firstName: String(item?.firstName || item?.first_name || "").trim(),
          lastName: String(item?.lastName || item?.last_name || "").trim(),
          middleName: String(item?.middleName || item?.middle_name || "").trim(),
          classId: String(item?.classId || item?.class_id || "").trim(),
          className: String(item?.className || item?.class_name || "").trim(),
          positionId: String(item?.positionId || item?.position_id || "").trim(),
          positionLabel: String(item?.positionLabel || item?.position_label || "").trim(),
          weeklyNorm: Number.parseInt(String(item?.weeklyNorm || item?.weekly_norm || "0"), 10) || 0,
          currentBooked: Number.parseInt(String(item?.currentBooked || item?.current_booked || "0"), 10) || 0,
          status: String(item?.status || "").trim(),
          statusKey: String(item?.statusKey || item?.status_key || "").trim().toLowerCase(),
          specialists: normalizeSpecialistItems(item?.specialists)
        }))
        .filter((item) => Boolean(item.clientId) && Boolean(item.positionId));

      const nextClients = (Array.isArray(data?.clients) ? data.clients : [])
        .map((item) => ({
          id: String(item?.id || "").trim(),
          firstName: String(item?.firstName || item?.first_name || "").trim(),
          lastName: String(item?.lastName || item?.last_name || "").trim(),
          middleName: String(item?.middleName || item?.middle_name || "").trim()
        }))
        .filter((item) => Boolean(item.id));

      const nextClasses = (Array.isArray(data?.classes) ? data.classes : [])
        .map((item) => ({
          id: String(item?.id || "").trim(),
          className: String(item?.className || item?.class_name || "").trim()
        }))
        .filter((item) => Boolean(item.id));

      const nextPositions = (Array.isArray(data?.positions) ? data.positions : [])
        .map((item) => ({
          id: String(item?.id || "").trim(),
          label: String(item?.label || "").trim()
        }))
        .filter((item) => Boolean(item.id));

      const nextSpecialists = normalizeSpecialistItems(data?.specialists);

      setVipNormMonitoringItems(nextItems);
      setVipNormMonitoringFilters({
        clients: nextClients,
        classes: nextClasses,
        positions: nextPositions,
        specialists: nextSpecialists
      });
      if (nextItems.length === 0) {
        setVipNormMonitoringMessage("No norm monitoring records found.");
      }
    } catch {
      setVipNormMonitoringItems([]);
      setVipNormMonitoringFilters({
        clients: [],
        classes: [],
        positions: [],
        specialists: []
      });
      setVipNormMonitoringMessage("Failed to load VIP norm monitoring.");
    } finally {
      setVipNormMonitoringLoading(false);
    }
  }, [canOpenAppointmentVipNormMonitoring, navigate]);

  useEffect(() => {
    if (mainView !== "appointment-vip-norm-monitoring") {
      return;
    }
    void loadVipNormMonitoring();
  }, [loadVipNormMonitoring, mainView]);

  return {
    vipNormMonitoringItems,
    vipNormMonitoringFilters,
    vipNormMonitoringMessage,
    vipNormMonitoringLoading,
    loadVipNormMonitoring
  };
}
