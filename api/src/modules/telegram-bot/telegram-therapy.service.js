import { updateAppointmentSchedulesByIds } from "../appointments/appointment-settings.service.js";
import { clearAppointmentSchedulesReadCache } from "../appointments/appointment-schedules-read-cache.js";
import { botToday, isBotDate } from "./telegram-calendar.js";

// The caller owns the navigation transaction; lock before checking stale buttons.
export async function setTelegramTherapyStatus({ organizationId, specialistId, appointmentId, clientId, date, confirmed, db },
  updateSchedules = updateAppointmentSchedulesByIds) {
  if (!isBotDate(date) || date > botToday()) return false;
  const { rows: [item] } = await db.query(`SELECT s.* FROM appointment_schedules s
    WHERE s.organization_id = $1 AND s.id = $2 AND s.specialist_id = $3
      AND s.client_id = $4 AND s.appointment_date = $5::date FOR UPDATE`,
  [organizationId, appointmentId, specialistId, clientId, date]);
  if (!item || !["pending", "confirmed"].includes(item.status)) return false;
  const status = confirmed ? "confirmed" : "pending";
  if (item.status === status) return false;
  const locked = await db.query(`SELECT id FROM finance_tickets WHERE organization_id = $1
    AND appointment_schedule_id = $2 AND status <> 'voided' LIMIT 1`, [organizationId, appointmentId]);
  if (locked.rows.length) return false;
  await updateSchedules({ organizationId, actorUserId: specialistId, ids: [appointmentId], specialistId,
    clientId, appointmentDate: date, startTime: item.start_time, endTime: item.end_time,
    durationMinutes: item.duration_minutes, serviceName: item.service_name, serviceId: item.service_id,
    servicePriceUzs: item.service_price_uzs, status, note: item.note, activateClient: false, db });
  clearAppointmentSchedulesReadCache();
  return true;
}
