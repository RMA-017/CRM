import {
  ROLE_PERMISSION_TEMPLATE,
  filterPermissionOptionsByFeatures,
  hasAllowedFeature
} from "../../../../shared/access-registry.js";

export function normalizeSettingsSortOrderInput(value) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isInteger(parsed) ? parsed : 0;
}

const ROLE_PERMISSION_ACTION_ORDER = new Map([
  ["open", 0],
  ["read", 1],
  ["create", 2],
  ["edit", 3],
  ["update", 3],
  ["delete", 4],
  ["all clients", 5],
  ["assigned only", 6],
  ["search clients", 7],
  ["send", 8],
  ["notify manager", 9],
  ["notify specialist", 10]
]);

export function filterPermissionsByOrgFeatures(permissions, orgFeatures) {
  return filterPermissionOptionsByFeatures(permissions, orgFeatures);
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

export function togglePermissionCodes(permissionCodes, codes, checked) {
  const nextCodes = new Set(normalizePermissionCodesInput(permissionCodes));
  normalizePermissionCodesInput(codes).forEach((code) => {
    if (checked) {
      nextCodes.add(code);
    } else {
      nextCodes.delete(code);
    }
  });
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

function normalizePermissionSegment(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
}

function createPermissionLeaf(code, label) {
  const normalizedCode = String(code || "").trim().toLowerCase();
  if (!normalizedCode) {
    return null;
  }
  return {
    type: "permission",
    key: `permission:${normalizedCode}:${label}`,
    code: normalizedCode,
    label: String(label || "").trim() || toTitleWords(normalizedCode),
    children: []
  };
}

function createPermissionGroupNode(key, label, children, order = 999, hiddenCodes = [], directCodes = []) {
  return {
    type: "group",
    key: String(key || "").trim() || `group:${label}`,
    label: String(label || "").trim() || "Other",
    order,
    hiddenCodes: Array.isArray(hiddenCodes) ? hiddenCodes.filter(Boolean) : [],
    directCodes: Array.isArray(directCodes) ? directCodes.filter(Boolean) : [],
    children: Array.isArray(children) ? children.filter(Boolean) : []
  };
}

function buildKnownRolePermissionTree(optionLabelByCode, usedCodes, orgFeatures) {
  return ROLE_PERMISSION_TEMPLATE.map((group, groupIndex) => {
    const childNodes = group.children
      .map((child, childIndex) => {
        // Skip features not enabled for this org.
        // For rootPermissions virtual children (featureKey present), use their explicit
        // featureKey (null = always visible, string = check against org features).
        // For regular feature children, fall back to child.key.
        const featureKeyToCheck = "featureKey" in child ? child.featureKey : child.key;
        if (featureKeyToCheck !== null && !hasAllowedFeature(orgFeatures, featureKeyToCheck)) {
          return null;
        }

        // Collect available permissions defined for this child feature.
        const availablePerms = child.permissions.filter((permission) => {
          const code = String(permission?.code || "").trim().toLowerCase();
          return code && optionLabelByCode.has(code);
        });

        // Separate implicit (read/open) from meaningful action permissions
        const IMPLICIT_ACTIONS = new Set(["read", "open"]);
        const implicitPerms = availablePerms.filter((p) => IMPLICIT_ACTIONS.has(p.actionKey));
        const otherPerms = availablePerms.filter((p) => !IMPLICIT_ACTIONS.has(p.actionKey));

        // If non-implicit permissions exist: show them, auto-manage implicit ones (hidden)
        // If only implicit exist: use them as direct toggle (group checkbox = the permission)
        const showPerms = otherPerms.length > 0 ? otherPerms : [];
        const hiddenImplicitCodes = otherPerms.length > 0
          ? implicitPerms.map((p) => String(p.code || "").trim().toLowerCase()).filter(Boolean)
          : [];
        const directImplicitCodes = otherPerms.length === 0
          ? implicitPerms.map((p) => String(p.code || "").trim().toLowerCase()).filter(Boolean)
          : [];

        // Mark all available codes as used
        availablePerms.forEach((permission) => {
          const code = String(permission?.code || "").trim().toLowerCase();
          if (code) {
            usedCodes.add(code);
          }
        });

        const permissionChildren = showPerms
          .map((permission) => {
            const code = String(permission?.code || "").trim().toLowerCase();
            if (!code) return null;
            return createPermissionLeaf(
              code,
              String(permission?.label || optionLabelByCode.get(code) || "").trim()
            );
          })
          .filter(Boolean);

        if (permissionChildren.length === 0 && directImplicitCodes.length === 0 && hiddenImplicitCodes.length === 0) {
          return null;
        }

        return createPermissionGroupNode(
          child.key || `${group.key}-${childIndex}`,
          child.label,
          permissionChildren,
          child.sortOrder ?? childIndex,
          hiddenImplicitCodes,
          directImplicitCodes
        );
      })
      .filter(Boolean);

    if (childNodes.length === 0) {
      return null;
    }

    return createPermissionGroupNode(
      group.key || `group-${groupIndex}`,
      group.label,
      childNodes,
      group.sortOrder ?? (groupIndex + 1) * 10
    );
  }).filter(Boolean);
}

function buildFallbackPermissionTree(optionLabelByCode, usedCodes) {
  const fallbackGroupMap = new Map();

  Array.from(optionLabelByCode.entries()).forEach(([code, label]) => {
    if (usedCodes.has(code)) {
      return;
    }

    const parts = code
      .split(".")
      .filter(Boolean)
      .map((part) => normalizePermissionSegment(part));
    const groupKey = parts[0] || "other";
    const childKey = parts.length > 2
      ? `${groupKey}.${parts[1]}`
      : `${groupKey}.general`;
    const childLabel = parts.length > 2 ? toTitleWords(parts[1]) : "General";
    const actionLabel = parts.length > 2
      ? toTitleWords(parts.slice(2).join(" "))
      : (parts.length === 2 ? toTitleWords(parts[1]) : (String(label || "").trim() || toTitleWords(code)));

    if (!fallbackGroupMap.has(groupKey)) {
      fallbackGroupMap.set(groupKey, {
        key: groupKey,
        label: toTitleWords(groupKey),
        order: 90,
        children: new Map()
      });
    }

    const group = fallbackGroupMap.get(groupKey);
    if (!group.children.has(childKey)) {
      group.children.set(childKey, {
        key: childKey,
        label: childLabel,
        order: group.children.size,
        children: []
      });
    }

    group.children.get(childKey).children.push(
      createPermissionLeaf(code, actionLabel)
    );
  });

  return Array.from(fallbackGroupMap.values())
    .map((group) => createPermissionGroupNode(
      group.key,
      group.label,
      Array.from(group.children.values())
        .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label))
        .map((child) => createPermissionGroupNode(
          child.key,
          child.label,
          child.children.sort((left, right) => left.label.localeCompare(right.label)),
          child.order
        )),
      group.order
    ))
    .sort((left, right) => {
      if (left.order !== right.order) {
        return left.order - right.order;
      }
      return left.label.localeCompare(right.label);
    });
}

function mergeRolePermissionTreeGroups(baseTree, nextTree) {
  const groupMap = new Map();

  [...baseTree, ...nextTree].forEach((group) => {
    if (!group || group.type !== "group") {
      return;
    }

    if (!groupMap.has(group.key)) {
      groupMap.set(group.key, {
        ...group,
        children: []
      });
    }

    const targetGroup = groupMap.get(group.key);
    const childMap = new Map(
      (Array.isArray(targetGroup.children) ? targetGroup.children : []).map((child) => [child.key, child])
    );

    (Array.isArray(group.children) ? group.children : []).forEach((child) => {
      if (!child || child.type !== "group") {
        return;
      }
      if (!childMap.has(child.key)) {
        childMap.set(child.key, {
          ...child,
          children: Array.isArray(child.children) ? [...child.children] : []
        });
        return;
      }

      const targetChild = childMap.get(child.key);
      targetChild.children = [
        ...(Array.isArray(targetChild.children) ? targetChild.children : []),
        ...(Array.isArray(child.children) ? child.children : [])
      ];
      targetChild.order = Math.min(
        Number(targetChild.order ?? 999),
        Number(child.order ?? 999)
      );
    });

    targetGroup.children = Array.from(childMap.values());
    targetGroup.order = Math.min(
      Number(targetGroup.order ?? 999),
      Number(group.order ?? 999)
    );
  });

  return Array.from(groupMap.values());
}

function countRolePermissionLeafCodes(nodes, counts = new Map()) {
  nodes.forEach((node) => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (node.type === "permission") {
      counts.set(node.code, (counts.get(node.code) ?? 0) + 1);
      return;
    }
    countRolePermissionLeafCodes(Array.isArray(node.children) ? node.children : [], counts);
  });
  return counts;
}

function annotateRolePermissionTree(nodes, sharedCodeCounts) {
  return nodes.map((node) => {
    if (!node || typeof node !== "object") {
      return null;
    }
    if (node.type === "permission") {
      return {
        ...node,
        isShared: (sharedCodeCounts.get(node.code) ?? 0) > 1,
        descendantCodes: [node.code]
      };
    }

    const children = annotateRolePermissionTree(Array.isArray(node.children) ? node.children : [], sharedCodeCounts)
      .filter(Boolean)
      .sort((left, right) => {
        const leftOrder = Number(left?.order ?? 999);
        const rightOrder = Number(right?.order ?? 999);
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }
        if (left.type === "permission" && right.type === "permission") {
          const leftRank = ROLE_PERMISSION_ACTION_ORDER.get(String(left.label || "").trim().toLowerCase()) ?? 99;
          const rightRank = ROLE_PERMISSION_ACTION_ORDER.get(String(right.label || "").trim().toLowerCase()) ?? 99;
          if (leftRank !== rightRank) {
            return leftRank - rightRank;
          }
        }
        return String(left?.label || "").localeCompare(String(right?.label || ""));
      });

    const directCodes = Array.isArray(node.directCodes) ? node.directCodes : [];
    const descendantCodes = Array.from(new Set([
      ...children.flatMap((child) => Array.isArray(child?.descendantCodes) ? child.descendantCodes : []),
      ...directCodes
    ]));

    if (descendantCodes.length === 0) {
      return null;
    }

    return {
      ...node,
      children,
      descendantCodes
    };
  }).filter(Boolean);
}

export function buildRolePermissionTree(rolePermissionOptions, orgFeatures = null) {
  const optionLabelByCode = new Map();
  (Array.isArray(rolePermissionOptions) ? rolePermissionOptions : []).forEach((permission) => {
    const code = String(permission?.code || permission?.value || "").trim().toLowerCase();
    if (!code) {
      return;
    }
    optionLabelByCode.set(code, String(permission?.label || "").trim());
  });

  const usedCodes = new Set();
  const tree = mergeRolePermissionTreeGroups(
    buildKnownRolePermissionTree(optionLabelByCode, usedCodes, orgFeatures),
    buildFallbackPermissionTree(optionLabelByCode, usedCodes)
  );
  const sharedCodeCounts = countRolePermissionLeafCodes(tree);
  return annotateRolePermissionTree(tree, sharedCodeCounts);
}

export function normalizePermissionCodesWithTree(codes, tree) {
  const codeSet = new Set(normalizePermissionCodesInput(codes));

  function processNode(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "group" && Array.isArray(node.hiddenCodes) && node.hiddenCodes.length > 0) {
      const hasVisibleSelected = (Array.isArray(node.descendantCodes) ? node.descendantCodes : []).some(
        (code) => codeSet.has(code)
      );
      node.hiddenCodes.forEach((readCode) => {
        if (hasVisibleSelected) {
          codeSet.add(readCode);
        } else {
          codeSet.delete(readCode);
        }
      });
    }
    (Array.isArray(node.children) ? node.children : []).forEach(processNode);
  }

  (Array.isArray(tree) ? tree : []).forEach(processNode);
  return Array.from(codeSet);
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

export function compareTextInsensitive(left, right) {
  return String(left || "").trim().localeCompare(String(right || "").trim(), undefined, {
    sensitivity: "base"
  });
}

export function mapVipClassAssignmentOption(item) {
  const id = String(item?.id || item?.classId || item?.class_id || "").trim();
  if (!id) {
    return null;
  }
  return {
    id,
    className: String(item?.className || item?.class_name || "").trim(),
    teacherId: String(item?.teacherId || item?.teacher_id || "").trim(),
    teacherName: String(item?.teacherName || item?.teacher_name || "").trim()
  };
}

export function sortVipClassDailyRoutineRows(items) {
  const rows = Array.isArray(items) ? [...items] : [];
  return rows.sort((a, b) => {
    const classCompare = compareTextInsensitive(a?.className, b?.className);
    if (classCompare !== 0) {
      return classCompare;
    }

    const dayCompare = Number(a?.dayOfWeek || 0) - Number(b?.dayOfWeek || 0);
    if (dayCompare !== 0) {
      return dayCompare;
    }

    const startCompare = String(a?.startTime || "").localeCompare(String(b?.startTime || ""));
    if (startCompare !== 0) {
      return startCompare;
    }

    return String(a?.id || "").localeCompare(String(b?.id || ""));
  });
}

const FORCED_VIEW_REQUIRED_FEATURES = {
  "clients-medical-history": ["clients.medical_history"],
  "appointment": ["appointments.planner"],
  "appointment-breaks": ["appointments.breaks"],
  "appointment-vip-attendance": ["vip_clients.attendance"],
  "appointment-vip-my-children": ["vip_clients.my_children"],
  "appointment-vip-daily-routines": ["vip_clients.daily_routines"],
  "appointment-vip-assignments": ["assignments.class"],
  "appointment-vip-tutor-assignments": ["assignments.tutor"],
  "appointment-vip-schedule": ["vip_clients.my_class"],
  "appointment-settings": ["settings.appointments"],
  "appointment-work-schedule": ["appointments.work_schedule"],
  "settings-roles": ["settings.roles"],
  "settings-positions": ["settings.positions"],
  "statistics": ["statistics.class_attendance"],
  "statistics-class": ["statistics.class_attendance"],
  "statistics-planner-report": ["statistics.planner_report"]
};

export function isViewBlockedByOrgFeatures(forcedView, rawOrgFeatures) {
  if (!Array.isArray(rawOrgFeatures)) {
    return false;
  }
  const requiredFeatures = FORCED_VIEW_REQUIRED_FEATURES[forcedView];
  if (!requiredFeatures) {
    return false;
  }
  return requiredFeatures.some((feature) => !hasAllowedFeature(rawOrgFeatures, feature));
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
