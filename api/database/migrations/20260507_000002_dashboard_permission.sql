INSERT INTO permissions (code, label, sort_order, is_active)
VALUES ('dashboard.read', 'Read Dashboard', 67, TRUE)
ON CONFLICT (code) DO UPDATE
  SET label = EXCLUDED.label,
      sort_order = EXCLUDED.sort_order,
      is_active = TRUE;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM role_options r
  JOIN permissions p ON LOWER(p.code) = 'dashboard.read'
 WHERE r.is_active = TRUE
   AND r.is_admin = TRUE
ON CONFLICT (role_id, permission_id) DO NOTHING;
