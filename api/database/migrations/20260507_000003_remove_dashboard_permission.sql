DELETE FROM role_permissions
WHERE permission_id IN (
  SELECT id
  FROM permissions
  WHERE LOWER(code) = 'dashboard.read'
);

DELETE FROM permissions
WHERE LOWER(code) = 'dashboard.read';
