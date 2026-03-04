import pool from "../../config/db.js";

// Haversine formula — returns distance in meters
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function mapSettings(row) {
  return {
    workStart: row.work_start,
    workEnd: row.work_end,
    lateThresholdMinutes: Number(row.late_threshold_minutes),
    locationLat: row.location_lat != null ? Number(row.location_lat) : null,
    locationLng: row.location_lng != null ? Number(row.location_lng) : null,
    locationRadiusMeters: Number(row.location_radius_meters),
    faceCheckFrequency: Number(row.face_check_frequency)
  };
}

function mapRecord(row) {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    organizationId: String(row.organization_id),
    date: row.date,
    checkInAt: row.check_in_at || null,
    checkOutAt: row.check_out_at || null,
    faceVerified: Boolean(row.face_verified),
    status: row.status,
    fullName: row.full_name || null,
    username: row.username || null
  };
}

export async function getOrgSettings(organizationId) {
  const { rows } = await pool.query(
    `SELECT * FROM staff_attendance_settings WHERE organization_id = $1 LIMIT 1`,
    [organizationId]
  );
  return rows[0] ? mapSettings(rows[0]) : null;
}

export async function getEffectiveSettings(userId, organizationId) {
  const { rows } = await pool.query(
    `SELECT
       COALESCE(us.work_start, os.work_start, '09:00:00'::time) AS work_start,
       COALESCE(us.work_end,   os.work_end,   '18:00:00'::time) AS work_end,
       COALESCE(os.late_threshold_minutes, 15)   AS late_threshold_minutes,
       os.location_lat,
       os.location_lng,
       COALESCE(os.location_radius_meters, 100)  AS location_radius_meters,
       COALESCE(os.face_check_frequency,   5)    AS face_check_frequency
     FROM organizations o
     LEFT JOIN staff_attendance_settings      os ON os.organization_id = o.id
     LEFT JOIN staff_attendance_user_settings us ON us.user_id = $1 AND us.organization_id = o.id
     WHERE o.id = $2
     LIMIT 1`,
    [userId, organizationId]
  );
  return rows[0] ? mapSettings(rows[0]) : null;
}

function determineStatus(settings, nowDate) {
  if (!settings?.workStart) return "on_time";
  const [wh, wm] = settings.workStart.split(":").map(Number);
  const thresholdMinutes = wh * 60 + wm + settings.lateThresholdMinutes;
  const nowMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();
  return nowMinutes > thresholdMinutes ? "late" : "on_time";
}

export async function getTodayRecord(userId) {
  const today = new Date().toISOString().split("T")[0];
  const { rows } = await pool.query(
    `SELECT * FROM staff_attendance WHERE user_id = $1 AND date = $2 LIMIT 1`,
    [userId, today]
  );
  return rows[0] ? mapRecord(rows[0]) : null;
}

export async function checkIn({ userId, organizationId, lat, lng, accuracy, faceDescriptor }) {
  const settings = await getEffectiveSettings(userId, organizationId);

  if (settings?.locationLat != null && settings?.locationLng != null) {
    const distance = haversineDistance(lat, lng, settings.locationLat, settings.locationLng);
    if (distance > settings.locationRadiusMeters) {
      return { success: false, code: "OUT_OF_RANGE", distance: Math.round(distance) };
    }
  }

  const today = new Date().toISOString().split("T")[0];

  const { rows: existing } = await pool.query(
    `SELECT id, check_in_at FROM staff_attendance WHERE user_id = $1 AND date = $2 LIMIT 1`,
    [userId, today]
  );
  if (existing[0]?.check_in_at) {
    return { success: false, code: "ALREADY_CHECKED_IN" };
  }

  // Optional face verification
  let resolvedFaceVerified = false;
  if (Array.isArray(faceDescriptor) && faceDescriptor.length === 128) {
    const faceResult = await verifyFaceDescriptor(userId, faceDescriptor);
    resolvedFaceVerified = faceResult.verified;
  }

  const status = determineStatus(settings, new Date());

  const { rows } = await pool.query(
    `INSERT INTO staff_attendance
       (user_id, organization_id, date, check_in_at, check_in_lat, check_in_lng, check_in_accuracy, face_verified, status)
     VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, date) DO UPDATE
       SET check_in_at       = EXCLUDED.check_in_at,
           check_in_lat      = EXCLUDED.check_in_lat,
           check_in_lng      = EXCLUDED.check_in_lng,
           check_in_accuracy = EXCLUDED.check_in_accuracy,
           face_verified     = EXCLUDED.face_verified,
           status            = EXCLUDED.status
     RETURNING *`,
    [userId, organizationId, today, lat, lng, accuracy, resolvedFaceVerified, status]
  );

  return { success: true, record: mapRecord(rows[0]) };
}

export async function checkOut({ userId, organizationId, lat, lng, accuracy }) {
  const settings = await getEffectiveSettings(userId, organizationId);

  if (settings?.locationLat != null && settings?.locationLng != null) {
    const distance = haversineDistance(lat, lng, settings.locationLat, settings.locationLng);
    if (distance > settings.locationRadiusMeters) {
      return { success: false, code: "OUT_OF_RANGE", distance: Math.round(distance) };
    }
  }

  const today = new Date().toISOString().split("T")[0];

  const { rows } = await pool.query(
    `UPDATE staff_attendance
       SET check_out_at       = NOW(),
           check_out_lat      = $3,
           check_out_lng      = $4,
           check_out_accuracy = $5
     WHERE user_id = $1
       AND date = $2
       AND check_in_at IS NOT NULL
       AND check_out_at IS NULL
     RETURNING *`,
    [userId, today, lat, lng, accuracy]
  );

  if (rows.length === 0) {
    return { success: false, code: "NOT_CHECKED_IN" };
  }

  return { success: true, record: mapRecord(rows[0]) };
}

export async function getMyAttendance({ userId, from, to }) {
  const { rows } = await pool.query(
    `SELECT * FROM staff_attendance
     WHERE user_id = $1 AND date >= $2 AND date <= $3
     ORDER BY date DESC`,
    [userId, from, to]
  );
  return rows.map(mapRecord);
}

export async function getAttendanceList({ organizationId, from, to, userId }) {
  const params = [organizationId, from, to];
  let userFilter = "";
  if (userId) {
    params.push(userId);
    userFilter = `AND a.user_id = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT a.*, u.full_name, u.username
     FROM staff_attendance a
     JOIN users u ON u.id = a.user_id
     WHERE a.organization_id = $1
       AND a.date >= $2
       AND a.date <= $3
       ${userFilter}
     ORDER BY a.date DESC, u.full_name ASC`,
    params
  );
  return rows.map(mapRecord);
}

export async function upsertOrgSettings({
  organizationId,
  workStart,
  workEnd,
  lateThresholdMinutes,
  locationLat,
  locationLng,
  locationRadiusMeters,
  faceCheckFrequency
}) {
  const { rows } = await pool.query(
    `INSERT INTO staff_attendance_settings
       (organization_id, work_start, work_end, late_threshold_minutes,
        location_lat, location_lng, location_radius_meters, face_check_frequency)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (organization_id) DO UPDATE
       SET work_start             = EXCLUDED.work_start,
           work_end               = EXCLUDED.work_end,
           late_threshold_minutes = EXCLUDED.late_threshold_minutes,
           location_lat           = EXCLUDED.location_lat,
           location_lng           = EXCLUDED.location_lng,
           location_radius_meters = EXCLUDED.location_radius_meters,
           face_check_frequency   = EXCLUDED.face_check_frequency,
           updated_at             = CURRENT_TIMESTAMP
     RETURNING *`,
    [organizationId, workStart, workEnd, lateThresholdMinutes,
      locationLat ?? null, locationLng ?? null, locationRadiusMeters, faceCheckFrequency]
  );
  return mapSettings(rows[0]);
}

export async function upsertUserSettings({ userId, organizationId, workStart, workEnd }) {
  const { rows } = await pool.query(
    `INSERT INTO staff_attendance_user_settings (user_id, organization_id, work_start, work_end)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, organization_id) DO UPDATE
       SET work_start = EXCLUDED.work_start,
           work_end   = EXCLUDED.work_end,
           updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [userId, organizationId, workStart || null, workEnd || null]
  );
  return {
    userId: String(rows[0].user_id),
    organizationId: String(rows[0].organization_id),
    workStart: rows[0].work_start,
    workEnd: rows[0].work_end
  };
}

// ── Face descriptor helpers ───────────────────────────────────────────────

function euclideanDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

export async function getFaceEnrollmentStatus(userId) {
  const { rows } = await pool.query(
    `SELECT face_descriptor IS NOT NULL AS enrolled, face_enrolled_at FROM users WHERE id = $1`,
    [userId]
  );
  return {
    enrolled: Boolean(rows[0]?.enrolled),
    enrolledAt: rows[0]?.face_enrolled_at || null
  };
}

export async function saveFaceDescriptor(userId, descriptor) {
  await pool.query(
    `UPDATE users SET face_descriptor = $2, face_enrolled_at = NOW() WHERE id = $1`,
    [userId, JSON.stringify(descriptor)]
  );
}

export async function clearFaceDescriptor(userId) {
  await pool.query(
    `UPDATE users SET face_descriptor = NULL, face_enrolled_at = NULL WHERE id = $1`,
    [userId]
  );
}

// Returns { verified: bool, distance: number|null, code?: string }
export async function verifyFaceDescriptor(userId, descriptor) {
  if (!Array.isArray(descriptor) || descriptor.length !== 128) {
    return { verified: false, distance: null, code: "INVALID_DESCRIPTOR" };
  }
  const { rows } = await pool.query(
    `SELECT face_descriptor FROM users WHERE id = $1`,
    [userId]
  );
  const stored = rows[0]?.face_descriptor;
  if (!stored) return { verified: false, distance: null, code: "NOT_ENROLLED" };

  const storedArr = Array.isArray(stored) ? stored : Object.values(stored);
  const distance = euclideanDistance(storedArr, descriptor);
  const THRESHOLD = 0.6;
  return { verified: distance <= THRESHOLD, distance };
}

export async function getUserSettingsList(organizationId) {
  const { rows } = await pool.query(
    `SELECT us.*, u.full_name, u.username
     FROM staff_attendance_user_settings us
     JOIN users u ON u.id = us.user_id
     WHERE us.organization_id = $1
     ORDER BY u.full_name ASC`,
    [organizationId]
  );
  return rows.map((row) => ({
    userId: String(row.user_id),
    organizationId: String(row.organization_id),
    workStart: row.work_start,
    workEnd: row.work_end,
    fullName: row.full_name,
    username: row.username
  }));
}
