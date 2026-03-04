import {
  checkIn,
  checkOut,
  clearFaceDescriptor,
  getAttendanceList,
  getEffectiveSettings,
  getFaceEnrollmentStatus,
  getMyAttendance,
  getTodayRecord,
  getUserSettingsList,
  saveFaceDescriptor,
  upsertOrgSettings,
  upsertUserSettings
} from "./staff-attendance.service.js";

function parseDate(value, fallback) {
  const s = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback;
}

function todayYmd() {
  return new Date().toISOString().split("T")[0];
}

function thirtyDaysAgoYmd() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split("T")[0];
}

async function staffAttendanceRoutes(fastify) {
  // GET /api/staff-attendance/settings — effective settings for current user
  fastify.get("/settings", async (request, reply) => {
    const { userId, organizationId } = request.authContext;
    const settings = await getEffectiveSettings(userId, organizationId);
    if (!settings) {
      return reply.send({
        workStart: "09:00:00",
        workEnd: "18:00:00",
        lateThresholdMinutes: 15,
        locationLat: null,
        locationLng: null,
        locationRadiusMeters: 100,
        faceCheckFrequency: 5
      });
    }
    return reply.send(settings);
  });

  // GET /api/staff-attendance/me/face — my face enrollment status
  fastify.get("/me/face", async (request, reply) => {
    const { userId } = request.authContext;
    const status = await getFaceEnrollmentStatus(userId);
    return reply.send(status);
  });

  // POST /api/staff-attendance/me/face — save face descriptor
  fastify.post("/me/face", async (request, reply) => {
    const { userId } = request.authContext;
    const descriptor = request.body?.descriptor;
    if (!Array.isArray(descriptor) || descriptor.length !== 128) {
      return reply.status(400).send({ message: "Invalid face descriptor." });
    }
    await saveFaceDescriptor(userId, descriptor);
    const status = await getFaceEnrollmentStatus(userId);
    return reply.send(status);
  });

  // DELETE /api/staff-attendance/me/face — clear my face enrollment
  fastify.delete("/me/face", async (request, reply) => {
    const { userId } = request.authContext;
    await clearFaceDescriptor(userId);
    return reply.send({ enrolled: false, enrolledAt: null });
  });

  // GET /api/staff-attendance/me/today — today's record
  fastify.get("/me/today", async (request, reply) => {
    const { userId } = request.authContext;
    const record = await getTodayRecord(userId);
    return reply.send({ record: record || null });
  });

  // GET /api/staff-attendance/me — my history
  fastify.get("/me", async (request, reply) => {
    const { userId } = request.authContext;
    const from = parseDate(request.query.from, thirtyDaysAgoYmd());
    const to = parseDate(request.query.to, todayYmd());
    const records = await getMyAttendance({ userId, from, to });
    return reply.send({ records });
  });

  // POST /api/staff-attendance/checkin
  fastify.post("/checkin", async (request, reply) => {
    const { userId, organizationId } = request.authContext;
    const lat = Number(request.body?.lat);
    const lng = Number(request.body?.lng);
    const accuracy = Number(request.body?.accuracy ?? 0);
    const faceDescriptor = Array.isArray(request.body?.faceDescriptor) ? request.body.faceDescriptor : null;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return reply.status(400).send({ message: "Lokatsiya koordinatalari noto'g'ri." });
    }

    const result = await checkIn({ userId, organizationId, lat, lng, accuracy, faceDescriptor });

    if (!result.success) {
      if (result.code === "OUT_OF_RANGE") {
        return reply.status(400).send({
          message: `Siz ishxonadan tashqaridasiz (${result.distance} m uzoqda).`,
          code: result.code,
          distance: result.distance
        });
      }
      if (result.code === "ALREADY_CHECKED_IN") {
        return reply.status(409).send({
          message: "Siz bugun allaqachon qayd etilgansiz.",
          code: result.code
        });
      }
      return reply.status(400).send({ message: "Qayd etib bo'lmadi.", code: result.code });
    }

    return reply.send({ record: result.record });
  });

  // POST /api/staff-attendance/checkout
  fastify.post("/checkout", async (request, reply) => {
    const { userId, organizationId } = request.authContext;
    const lat = Number(request.body?.lat);
    const lng = Number(request.body?.lng);
    const accuracy = Number(request.body?.accuracy ?? 0);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return reply.status(400).send({ message: "Lokatsiya koordinatalari noto'g'ri." });
    }

    const result = await checkOut({ userId, organizationId, lat, lng, accuracy });

    if (!result.success) {
      if (result.code === "OUT_OF_RANGE") {
        return reply.status(400).send({
          message: `Siz ishxonadan tashqaridasiz (${result.distance} m uzoqda).`,
          code: result.code,
          distance: result.distance
        });
      }
      if (result.code === "NOT_CHECKED_IN") {
        return reply.status(409).send({
          message: "Bugun hali qayd etilmagansiz yoki allaqachon chiqib ketgansiz.",
          code: result.code
        });
      }
      return reply.status(400).send({ message: "Chiqish qayd etib bo'lmadi.", code: result.code });
    }

    return reply.send({ record: result.record });
  });

  // ── Admin routes ──────────────────────────────────────────────────────────

  // GET /api/staff-attendance — all users attendance (admin)
  fastify.get("/", async (request, reply) => {
    const { organizationId, requester } = request.authContext;
    if (!requester.is_admin) {
      return reply.status(403).send({ message: "Ruxsat yo'q." });
    }
    const from = parseDate(request.query.from, thirtyDaysAgoYmd());
    const to = parseDate(request.query.to, todayYmd());
    const userId = request.query.userId ? Number(request.query.userId) : null;
    const records = await getAttendanceList({ organizationId, from, to, userId });
    return reply.send({ records });
  });

  // PUT /api/staff-attendance/settings/org — org settings (admin)
  fastify.put("/settings/org", async (request, reply) => {
    const { organizationId, requester } = request.authContext;
    if (!requester.is_admin) {
      return reply.status(403).send({ message: "Ruxsat yo'q." });
    }

    const workStart = String(request.body?.workStart || "09:00").trim();
    const workEnd = String(request.body?.workEnd || "18:00").trim();
    const lateThresholdMinutes = Number(request.body?.lateThresholdMinutes ?? 15);
    const locationLat = request.body?.locationLat != null ? Number(request.body.locationLat) : null;
    const locationLng = request.body?.locationLng != null ? Number(request.body.locationLng) : null;
    const locationRadiusMeters = Number(request.body?.locationRadiusMeters ?? 100);
    const faceCheckFrequency = Number(request.body?.faceCheckFrequency ?? 5);

    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(workStart) || !/^\d{2}:\d{2}(:\d{2})?$/.test(workEnd)) {
      return reply.status(400).send({ message: "Ish vaqti noto'g'ri formatda (HH:MM)." });
    }

    const settings = await upsertOrgSettings({
      organizationId,
      workStart,
      workEnd,
      lateThresholdMinutes,
      locationLat,
      locationLng,
      locationRadiusMeters,
      faceCheckFrequency
    });

    return reply.send({ settings });
  });

  // PUT /api/staff-attendance/settings/user/:userId — user override (admin)
  fastify.put("/settings/user/:userId", async (request, reply) => {
    const { organizationId, requester } = request.authContext;
    if (!requester.is_admin) {
      return reply.status(403).send({ message: "Ruxsat yo'q." });
    }

    const targetUserId = Number(request.params.userId);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return reply.status(400).send({ message: "Foydalanuvchi ID noto'g'ri." });
    }

    const workStart = request.body?.workStart ? String(request.body.workStart).trim() : null;
    const workEnd = request.body?.workEnd ? String(request.body.workEnd).trim() : null;

    const userSettings = await upsertUserSettings({
      userId: targetUserId,
      organizationId,
      workStart,
      workEnd
    });

    return reply.send({ userSettings });
  });

  // DELETE /api/staff-attendance/settings/user/:userId/face — admin clear user face
  fastify.delete("/settings/user/:userId/face", async (request, reply) => {
    const { requester } = request.authContext;
    if (!requester.is_admin) {
      return reply.status(403).send({ message: "Ruxsat yo'q." });
    }
    const targetUserId = Number(request.params.userId);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return reply.status(400).send({ message: "Foydalanuvchi ID noto'g'ri." });
    }
    await clearFaceDescriptor(targetUserId);
    return reply.send({ enrolled: false, enrolledAt: null });
  });

  // GET /api/staff-attendance/settings/users — list all user overrides (admin)
  fastify.get("/settings/users", async (request, reply) => {
    const { organizationId, requester } = request.authContext;
    if (!requester.is_admin) {
      return reply.status(403).send({ message: "Ruxsat yo'q." });
    }
    const userSettings = await getUserSettingsList(organizationId);
    return reply.send({ userSettings });
  });
}

export default staffAttendanceRoutes;
