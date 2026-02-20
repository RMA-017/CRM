export function normalizeSettingsSortOrderInput(value) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isInteger(parsed) ? parsed : 0;
}

export function normalizePermissionCodesInput(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((code) => String(code || "").trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

export function togglePermissionCode(permissionCodes, code, checked) {
  const normalizedCode = String(code || "").trim().toLowerCase();
  if (!normalizedCode) {
    return normalizePermissionCodesInput(permissionCodes);
  }

  const nextCodes = new Set(normalizePermissionCodesInput(permissionCodes));
  if (checked) {
    nextCodes.add(normalizedCode);
  } else {
    nextCodes.delete(normalizedCode);
  }
  return Array.from(nextCodes);
}

function toTitleWords(value) {
  return String(value || "")
    .trim()
    .replace(/[._-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function mapValueLabelOptions(items, getValue, getLabel) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => ({
      value: String(getValue(item) || "").trim(),
      label: String(getLabel(item) || "").trim()
    }))
    .filter((option) => option.value && option.label);
}

export function groupRolePermissionOptions(rolePermissionOptions) {
  const actionOrder = new Map([
    ["read", 1],
    ["create", 2],
    ["update", 3],
    ["delete", 4]
  ]);
  const groups = new Map();

  rolePermissionOptions.forEach((permission) => {
    const code = String(permission?.value || "").trim().toLowerCase();
    if (!code) {
      return;
    }

    const parts = code.split(".").filter(Boolean);
    const moduleKey = parts[0] || "other";
    const actionKey = parts.slice(1).join(".") || code;

    if (!groups.has(moduleKey)) {
      groups.set(moduleKey, {
        key: moduleKey,
        label: toTitleWords(moduleKey),
        permissions: []
      });
    }

    groups.get(moduleKey).permissions.push({
      code,
      actionKey,
      actionLabel: toTitleWords(actionKey) || String(permission?.label || "").trim() || code
    });
  });

  return Array.from(groups.values())
    .sort((left, right) => left.label.localeCompare(right.label))
    .map((group) => ({
      ...group,
      permissions: group.permissions.sort((left, right) => {
        const leftAction = left.actionKey.split(".")[0];
        const rightAction = right.actionKey.split(".")[0];
        const leftRank = actionOrder.get(leftAction) ?? 99;
        const rightRank = actionOrder.get(rightAction) ?? 99;
        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }
        return left.actionLabel.localeCompare(right.actionLabel);
      })
    }));
}

export function handleProtectedStatus(response, navigate) {
  const status = Number(response?.status);
  if (status === 401) {
    navigate("/", { replace: true });
    return true;
  }
  if (status === 403 || status === 404) {
    navigate("/404", { replace: true });
    return true;
  }
  return false;
}
