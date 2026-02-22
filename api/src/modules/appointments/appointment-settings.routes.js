import { setNoCacheHeaders } from "../../lib/http.js";
import { getAuthContext } from "../../lib/session.js";
import { getProfileByAuthContext } from "../profile/profile.service.js";
import { hasPermission } from "../users/access.service.js";
import { PERMISSIONS } from "../users/users.constants.js";
import {
  getAppointmentDayKeys,
  getAppointmentSettingsByOrganization,
  getAppointmentSpecialistsByOrganization,
  saveAppointmentSettings,
  toAppointmentDayNum
} from "./appointment-settings.service.js";

const DAY_KEYS = getAppointmentDayKeys();
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseNonNegativeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function parsePositiveInteger(value, fallback = 1) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function normalizeVisibleWeekDays(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = Array.from(
    new Set(
      value
        .map((dayKey) => String(dayKey || "").trim().toLowerCase())
        .filter((dayKey) => DAY_KEYS.includes(dayKey))
    )
  );

  return normalized.sort((a, b) => toAppointmentDayNum(a) - toAppointmentDayNum(b));
}

function normalizeWorkingHours(value) {
  const workingHours = {};

  DAY_KEYS.forEach((dayKey) => {
    const dayValue = (value && typeof value === "object") ? value[dayKey] : null;
    const start = String(dayValue?.start || "").trim();
    const end = String(dayValue?.end || "").trim();
    workingHours[dayKey] = { start, end };
  });

  return workingHours;
}

function validateSettingsPayload({
  slotIntervalMinutes,
  breakTimeMinutes,
  bufferTimeMinutes,
  noShowThreshold,
  reminderHours,
  visibleWeekDays,
  workingHours
}) {
  if (slotIntervalMinutes <= 0 || slotIntervalMinutes > 1440) {
    return { field: "slotInterval", message: "Slot interval must be between 1 and 1440 minutes." };
  }
  if (breakTimeMinutes < 0 || breakTimeMinutes > 1440) {
    return { field: "breakDurationMinutes", message: "Break time must be between 0 and 1440 minutes." };
  }
  if (bufferTimeMinutes < 0 || bufferTimeMinutes > 1440) {
    return { field: "bufferAfter", message: "Buffer time must be between 0 and 1440 minutes." };
  }
  if (noShowThreshold < 1 || noShowThreshold > 1000) {
    return { field: "noShowThreshold", message: "No-show threshold must be between 1 and 1000." };
  }
  if (reminderHours < 1 || reminderHours > 1000) {
    return { field: "reminderHours", message: "Reminder hours must be between 1 and 1000." };
  }
  if (!Array.isArray(visibleWeekDays) || visibleWeekDays.length === 0) {
    return { field: "visibleWeekDays", message: "At least one visible week day is required." };
  }

  for (const dayKey of DAY_KEYS) {
    const start = String(workingHours?.[dayKey]?.start || "").trim();
    const end = String(workingHours?.[dayKey]?.end || "").trim();
    const hasStart = Boolean(start);
    const hasEnd = Boolean(end);

    if (hasStart && !TIME_REGEX.test(start)) {
      return { field: `workingHours.${dayKey}.start`, message: `Invalid start time for ${dayKey}.` };
    }
    if (hasEnd && !TIME_REGEX.test(end)) {
      return { field: `workingHours.${dayKey}.end`, message: `Invalid end time for ${dayKey}.` };
    }
    if (hasStart !== hasEnd) {
      return { field: `workingHours.${dayKey}`, message: `Start and end time must both be set for ${dayKey}.` };
    }
    if (hasStart && hasEnd && start >= end) {
      return { field: `workingHours.${dayKey}`, message: `End time must be after start time for ${dayKey}.` };
    }

    if (visibleWeekDays.includes(dayKey) && !(hasStart && hasEnd)) {
      return { field: `workingHours.${dayKey}`, message: `Working hours are required for visible day ${dayKey}.` };
    }
  }

  return null;
}

async function requireAppointmentsAccess(request, reply) {
  const authContext = getAuthContext(request, reply);
  if (!authContext) {
    return null;
  }

  const requester = await getProfileByAuthContext(authContext);
  if (!requester) {
    reply.status(401).send({ message: "Unauthorized." });
    return null;
  }

  if (!(await hasPermission(requester.role_id, PERMISSIONS.APPOINTMENTS_READ))) {
    reply.status(404).send({ message: "Not found." });
    return null;
  }

  return { authContext, requester };
}

async function appointmentSettingsRoutes(fastify) {
  fastify.get(
    "/specialists",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      try {
        const access = await requireAppointmentsAccess(request, reply);
        if (!access) {
          return;
        }

        const items = await getAppointmentSpecialistsByOrganization(access.authContext.organizationId);
        return reply.send({ items });
      } catch (error) {
        console.error("Error fetching appointment specialists:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/settings",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      try {
        const access = await requireAppointmentsAccess(request, reply);
        if (!access) {
          return;
        }

        const settings = await getAppointmentSettingsByOrganization(access.authContext.organizationId);
        return reply.send({
          item: settings || null
        });
      } catch (error) {
        console.error("Error fetching appointment settings:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.patch(
    "/settings",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      try {
        const access = await requireAppointmentsAccess(request, reply);
        if (!access) {
          return;
        }

        const slotIntervalMinutes = parsePositiveInteger(request.body?.slotInterval, 0);
        const breakTimeMinutes = parseNonNegativeInteger(request.body?.breakDurationMinutes, -1);
        const bufferTimeMinutes = parseNonNegativeInteger(request.body?.bufferAfter, -1);
        const noShowThreshold = parsePositiveInteger(request.body?.noShowThreshold, 0);
        const reminderHours = parsePositiveInteger(request.body?.reminderHours, 0);
        const visibleWeekDays = normalizeVisibleWeekDays(request.body?.visibleWeekDays);
        const workingHours = normalizeWorkingHours(request.body?.workingHours);

        const validationError = validateSettingsPayload({
          slotIntervalMinutes,
          breakTimeMinutes,
          bufferTimeMinutes,
          noShowThreshold,
          reminderHours,
          visibleWeekDays,
          workingHours
        });
        if (validationError) {
          return reply.status(400).send(validationError);
        }

        const item = await saveAppointmentSettings({
          organizationId: access.authContext.organizationId,
          actorUserId: access.authContext.userId,
          slotIntervalMinutes,
          breakTimeMinutes,
          bufferTimeMinutes,
          noShowThreshold,
          reminderHours,
          visibleWeekDays,
          workingHours
        });

        return reply.send({
          message: "Appointment settings updated.",
          item
        });
      } catch (error) {
        console.error("Error updating appointment settings:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );
}

export default appointmentSettingsRoutes;
