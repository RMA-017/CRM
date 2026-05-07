INSERT INTO permissions (code, label, sort_order, is_active)
VALUES
  ('appointments.statistics.planner-report.only', 'Statistics Planner Report Only', 69, TRUE),
  ('appointments.statistics.planner-report.all', 'Statistics Planner Report All', 70, TRUE)
ON CONFLICT (code) DO UPDATE
SET label = EXCLUDED.label,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE;

INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, only_permission.id
FROM role_permissions rp
JOIN permissions read_permission
  ON read_permission.id = rp.permission_id
 AND LOWER(read_permission.code) = 'appointments.statistics.planner-report'
JOIN permissions only_permission
  ON LOWER(only_permission.code) = 'appointments.statistics.planner-report.only'
WHERE NOT EXISTS (
  SELECT 1
  FROM role_permissions existing
  WHERE existing.role_id = rp.role_id
    AND existing.permission_id = only_permission.id
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT r.id, all_permission.id
FROM role_options r
JOIN permissions all_permission
  ON LOWER(all_permission.code) = 'appointments.statistics.planner-report.all'
WHERE COALESCE(r.is_admin, FALSE) = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM role_permissions existing
    WHERE existing.role_id = r.id
      AND existing.permission_id = all_permission.id
  );
