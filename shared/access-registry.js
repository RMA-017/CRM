function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  Object.values(value).forEach((item) => deepFreeze(item));
  return value;
}

function definePermission({
  constantKey,
  code,
  label,
  uiLabel,
  sortOrder,
  actionKey,
  featureKeys = []
}) {
  return {
    constantKey: String(constantKey || "").trim() || null,
    code: String(code || "").trim().toLowerCase(),
    label: String(label || "").trim(),
    uiLabel: String(uiLabel || "").trim() || String(label || "").trim(),
    sortOrder: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
    actionKey: String(actionKey || "").trim().toLowerCase() || "custom",
    featureKeys: Array.isArray(featureKeys)
      ? Array.from(new Set(
          featureKeys
            .map((item) => String(item || "").trim().toLowerCase())
            .filter(Boolean)
        ))
      : []
  };
}

function defineFeature({
  key,
  label,
  sortOrder,
  defaultEnabled = true,
  permissions = []
}) {
  return {
    key: String(key || "").trim().toLowerCase(),
    label: String(label || "").trim(),
    sortOrder: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
    defaultEnabled: Boolean(defaultEnabled),
    permissions: permissions.map((permission) => ({
      ...permission,
      featureKeys: permission.featureKeys.length > 0
        ? permission.featureKeys
        : [String(key || "").trim().toLowerCase()]
    }))
  };
}

function defineMenu({
  key,
  label,
  sortOrder,
  showInOrgFeatures = true,
  rootPermissions = [],
  children = [],
  rootPermissionsLabel = "General"
}) {
  return {
    key: String(key || "").trim().toLowerCase(),
    label: String(label || "").trim(),
    sortOrder: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
    showInOrgFeatures: Boolean(showInOrgFeatures),
    rootPermissionsLabel: String(rootPermissionsLabel || "").trim() || "General",
    rootPermissions: rootPermissions.map((permission) => ({
      ...permission,
      featureKeys: permission.featureKeys.length > 0
        ? permission.featureKeys
        : (showInOrgFeatures ? [String(key || "").trim().toLowerCase()] : [])
    })),
    children
  };
}

export const ACCESS_MENU_REGISTRY = deepFreeze([
  defineMenu({
    key: "profile",
    label: "Profile",
    sortOrder: 10,
    showInOrgFeatures: false,
    rootPermissionsLabel: "Profile",
    rootPermissions: [
      definePermission({
        constantKey: "PROFILE_READ",
        code: "profile.read",
        label: "Read Profile",
        uiLabel: "Read",
        sortOrder: 10,
        actionKey: "read"
      }),
      definePermission({
        constantKey: "PROFILE_UPDATE",
        code: "profile.update",
        label: "Update Profile",
        uiLabel: "Edit",
        sortOrder: 20,
        actionKey: "update"
      })
    ]
  }),
  defineMenu({
    key: "users",
    label: "Users",
    sortOrder: 20,
    children: [
      defineFeature({
        key: "users.all_users",
        label: "All Users",
        sortOrder: 10,
        permissions: [
          definePermission({
            constantKey: "USERS_READ",
            code: "users.read",
            label: "Read Users",
            uiLabel: "Read",
            sortOrder: 30,
            actionKey: "read"
          }),
          definePermission({
            constantKey: "USERS_CREATE",
            code: "users.create",
            label: "Create Users",
            uiLabel: "Create",
            sortOrder: 31,
            actionKey: "create"
          }),
          definePermission({
            constantKey: "USERS_UPDATE",
            code: "users.update",
            label: "Update Users",
            uiLabel: "Edit",
            sortOrder: 32,
            actionKey: "update"
          }),
          definePermission({
            constantKey: "USERS_DELETE",
            code: "users.delete",
            label: "Delete Users",
            uiLabel: "Delete",
            sortOrder: 33,
            actionKey: "delete"
          })
        ]
      })
    ]
  }),
  defineMenu({
    key: "clients",
    label: "Clients",
    sortOrder: 30,
    children: [
      defineFeature({
        key: "clients.all_clients",
        label: "All Clients",
        sortOrder: 10,
        permissions: [
          definePermission({
            constantKey: "CLIENTS_READ",
            code: "clients.read",
            label: "Read Clients",
            uiLabel: "Read",
            sortOrder: 40,
            actionKey: "read"
          }),
          definePermission({
            constantKey: "CLIENTS_CREATE",
            code: "clients.create",
            label: "Create Clients",
            uiLabel: "Create",
            sortOrder: 41,
            actionKey: "create"
          }),
          definePermission({
            constantKey: "CLIENTS_UPDATE",
            code: "clients.update",
            label: "Update Clients",
            uiLabel: "Edit",
            sortOrder: 42,
            actionKey: "update"
          }),
          definePermission({
            constantKey: "CLIENTS_DELETE",
            code: "clients.delete",
            label: "Delete Clients",
            uiLabel: "Delete",
            sortOrder: 43,
            actionKey: "delete"
          })
        ]
      }),
      defineFeature({
        key: "clients.medical_history",
        label: "Medical History",
        sortOrder: 20,
        defaultEnabled: false,
        permissions: [
          definePermission({
            constantKey: "CLIENT_MEDICAL_HISTORY_READ",
            code: "clients.medical-history.read",
            label: "Read Client Medical History",
            uiLabel: "Read",
            sortOrder: 44,
            actionKey: "read"
          }),
          definePermission({
            constantKey: "CLIENT_MEDICAL_HISTORY_CREATE",
            code: "clients.medical-history.create",
            label: "Create Client Medical History",
            uiLabel: "Create",
            sortOrder: 45,
            actionKey: "create"
          }),
          definePermission({
            constantKey: "CLIENT_MEDICAL_HISTORY_UPDATE",
            code: "clients.medical-history.update",
            label: "Update Client Medical History",
            uiLabel: "Edit",
            sortOrder: 46,
            actionKey: "update"
          }),
          definePermission({
            constantKey: "CLIENT_MEDICAL_HISTORY_DELETE",
            code: "clients.medical-history.delete",
            label: "Delete Client Medical History",
            uiLabel: "Delete",
            sortOrder: 47,
            actionKey: "delete"
          })
        ]
      })
    ]
  }),
  defineMenu({
    key: "vip_clients",
    label: "VIP Clients",
    sortOrder: 40,
    children: [
      defineFeature({
        key: "vip_clients.my_class",
        label: "My Class",
        sortOrder: 10,
        permissions: [
          definePermission({
            constantKey: "APPOINTMENTS_VIP_CLIENTS_MY_CLASS",
            code: "appointments.vip-clients.my-class",
            label: "VIP Clients My Class",
            uiLabel: "Open",
            sortOrder: 60,
            actionKey: "open"
          })
        ]
      }),
      defineFeature({
        key: "vip_clients.attendance",
        label: "Attendance",
        sortOrder: 20,
        permissions: [
          definePermission({
            constantKey: "APPOINTMENTS_VIP_CLIENTS_READ",
            code: "appointments.vip-clients.read",
            label: "VIP Clients Read",
            uiLabel: "Read",
            sortOrder: 56,
            actionKey: "read"
          }),
          definePermission({
            constantKey: "APPOINTMENTS_VIP_CLIENTS_CREATE",
            code: "appointments.vip-clients.create",
            label: "VIP Clients Create",
            uiLabel: "Create",
            sortOrder: 57,
            actionKey: "create",
            featureKeys: ["vip_clients.attendance", "vip_clients.daily_routines"]
          }),
          definePermission({
            constantKey: "APPOINTMENTS_VIP_CLIENTS_UPDATE",
            code: "appointments.vip-clients.update",
            label: "VIP Clients Update",
            uiLabel: "Edit",
            sortOrder: 58,
            actionKey: "update",
            featureKeys: ["vip_clients.attendance", "vip_clients.daily_routines"]
          }),
          definePermission({
            constantKey: "APPOINTMENTS_VIP_CLIENTS_DELETE",
            code: "appointments.vip-clients.delete",
            label: "VIP Clients Delete",
            uiLabel: "Delete",
            sortOrder: 59,
            actionKey: "delete",
            featureKeys: ["vip_clients.attendance", "vip_clients.daily_routines"]
          }),
          definePermission({
            constantKey: "APPOINTMENTS_VIP_CLIENTS_SCOPE_ALL",
            code: "appointments.vip-clients.scope.all",
            label: "VIP Clients Scope: All",
            uiLabel: "All Clients",
            sortOrder: 74,
            actionKey: "scope.all"
          }),
          definePermission({
            constantKey: "APPOINTMENTS_VIP_CLIENTS_SCOPE_ASSIGNED",
            code: "appointments.vip-clients.scope.assigned",
            label: "VIP Clients Scope: Assigned",
            uiLabel: "Assigned Only",
            sortOrder: 75,
            actionKey: "scope.assigned"
          })
        ]
      }),
      defineFeature({
        key: "vip_clients.my_children",
        label: "My Children",
        sortOrder: 30,
        permissions: [
          definePermission({
            constantKey: "APPOINTMENTS_VIP_CLIENTS_MY_CHILDREN",
            code: "appointments.vip-clients.my-children",
            label: "My VIP Children Access",
            uiLabel: "Open",
            sortOrder: 61,
            actionKey: "open"
          })
        ]
      }),
      defineFeature({
        key: "vip_clients.daily_routines",
        label: "Daily Routines",
        sortOrder: 40,
        permissions: [
          definePermission({
            constantKey: "APPOINTMENTS_VIP_CLIENTS_DAILY_ROUTINES",
            code: "appointments.vip-clients.daily-routines",
            label: "VIP Clients Daily Routines",
            uiLabel: "Open",
            sortOrder: 62,
            actionKey: "open"
          }),
          definePermission({
            constantKey: "APPOINTMENTS_VIP_CLIENTS_CREATE",
            code: "appointments.vip-clients.create",
            label: "VIP Clients Create",
            uiLabel: "Create",
            sortOrder: 57,
            actionKey: "create",
            featureKeys: ["vip_clients.attendance", "vip_clients.daily_routines"]
          }),
          definePermission({
            constantKey: "APPOINTMENTS_VIP_CLIENTS_UPDATE",
            code: "appointments.vip-clients.update",
            label: "VIP Clients Update",
            uiLabel: "Edit",
            sortOrder: 58,
            actionKey: "update",
            featureKeys: ["vip_clients.attendance", "vip_clients.daily_routines"]
          }),
          definePermission({
            constantKey: "APPOINTMENTS_VIP_CLIENTS_DELETE",
            code: "appointments.vip-clients.delete",
            label: "VIP Clients Delete",
            uiLabel: "Delete",
            sortOrder: 59,
            actionKey: "delete",
            featureKeys: ["vip_clients.attendance", "vip_clients.daily_routines"]
          })
        ]
      })
    ]
  }),
  defineMenu({
    key: "assignments",
    label: "Assignments",
    sortOrder: 50,
    children: [
      defineFeature({
        key: "assignments.class",
        label: "Class",
        sortOrder: 10,
        permissions: [
          definePermission({
            constantKey: "APPOINTMENTS_ASSIGNMENTS_READ",
            code: "appointments.assignments.read",
            label: "Assignments Read",
            uiLabel: "Read",
            sortOrder: 63,
            actionKey: "read",
            featureKeys: ["assignments.class", "assignments.tutor"]
          }),
          definePermission({
            constantKey: "APPOINTMENTS_ASSIGNMENTS_CREATE",
            code: "appointments.assignments.create",
            label: "Assignments Create",
            uiLabel: "Create",
            sortOrder: 64,
            actionKey: "create",
            featureKeys: ["assignments.class", "assignments.tutor"]
          }),
          definePermission({
            constantKey: "APPOINTMENTS_ASSIGNMENTS_UPDATE",
            code: "appointments.assignments.update",
            label: "Assignments Update",
            uiLabel: "Edit",
            sortOrder: 65,
            actionKey: "update",
            featureKeys: ["assignments.class", "assignments.tutor"]
          }),
          definePermission({
            constantKey: "APPOINTMENTS_ASSIGNMENTS_DELETE",
            code: "appointments.assignments.delete",
            label: "Assignments Delete",
            uiLabel: "Delete",
            sortOrder: 66,
            actionKey: "delete",
            featureKeys: ["assignments.class", "assignments.tutor"]
          })
        ]
      }),
      defineFeature({
        key: "assignments.tutor",
        label: "Tutor",
        sortOrder: 20,
        permissions: [
          definePermission({
            constantKey: "APPOINTMENTS_ASSIGNMENTS_READ",
            code: "appointments.assignments.read",
            label: "Assignments Read",
            uiLabel: "Read",
            sortOrder: 63,
            actionKey: "read",
            featureKeys: ["assignments.class", "assignments.tutor"]
          }),
          definePermission({
            constantKey: "APPOINTMENTS_ASSIGNMENTS_CREATE",
            code: "appointments.assignments.create",
            label: "Assignments Create",
            uiLabel: "Create",
            sortOrder: 64,
            actionKey: "create",
            featureKeys: ["assignments.class", "assignments.tutor"]
          }),
          definePermission({
            constantKey: "APPOINTMENTS_ASSIGNMENTS_UPDATE",
            code: "appointments.assignments.update",
            label: "Assignments Update",
            uiLabel: "Edit",
            sortOrder: 65,
            actionKey: "update",
            featureKeys: ["assignments.class", "assignments.tutor"]
          }),
          definePermission({
            constantKey: "APPOINTMENTS_ASSIGNMENTS_DELETE",
            code: "appointments.assignments.delete",
            label: "Assignments Delete",
            uiLabel: "Delete",
            sortOrder: 66,
            actionKey: "delete",
            featureKeys: ["assignments.class", "assignments.tutor"]
          })
        ]
      })
    ]
  }),
  defineMenu({
    key: "appointments",
    label: "Appointments",
    sortOrder: 60,
    children: [
      defineFeature({
        key: "appointments.planner",
        label: "Planner",
        sortOrder: 10,
        permissions: [
          definePermission({
            constantKey: "APPOINTMENTS_SUBMENU_SCHEDULE",
            code: "appointments.schedule",
            label: "Appointments Planner Submenu",
            uiLabel: "Open",
            sortOrder: 54,
            actionKey: "open"
          }),
          definePermission({
            constantKey: "APPOINTMENTS_PLANNER_READ",
            code: "appointments.planner.read",
            label: "Read Appointment Planner",
            uiLabel: "Read",
            sortOrder: 55,
            actionKey: "read"
          }),
          definePermission({
            constantKey: "APPOINTMENTS_PLANNER_CREATE",
            code: "appointments.planner.create",
            label: "Create Appointment Planner",
            uiLabel: "Create",
            sortOrder: 56,
            actionKey: "create"
          }),
          definePermission({
            constantKey: "APPOINTMENTS_PLANNER_UPDATE",
            code: "appointments.planner.update",
            label: "Update Appointment Planner",
            uiLabel: "Edit",
            sortOrder: 57,
            actionKey: "update"
          }),
          definePermission({
            constantKey: "APPOINTMENTS_PLANNER_DELETE",
            code: "appointments.planner.delete",
            label: "Delete Appointment Planner",
            uiLabel: "Delete",
            sortOrder: 58,
            actionKey: "delete"
          }),
          definePermission({
            constantKey: "APPOINTMENTS_CLIENT_SEARCH",
            code: "appointments.client-search",
            label: "Search Clients In Appointments",
            uiLabel: "Search Clients",
            sortOrder: 59,
            actionKey: "search"
          })
        ]
      }),
      defineFeature({
        key: "appointments.breaks",
        label: "Breaks",
        sortOrder: 20,
        permissions: [
          definePermission({
            constantKey: "APPOINTMENTS_SUBMENU_BREAKS",
            code: "appointments.breaks",
            label: "Appointments Breaks Submenu",
            uiLabel: "Open",
            sortOrder: 60,
            actionKey: "open"
          }),
          definePermission({
            constantKey: "APPOINTMENTS_BREAKS_READ",
            code: "appointments.breaks.read",
            label: "Read Appointment Breaks",
            uiLabel: "Read",
            sortOrder: 61,
            actionKey: "read"
          }),
          definePermission({
            constantKey: "APPOINTMENTS_BREAKS_CREATE",
            code: "appointments.breaks.create",
            label: "Create Appointment Breaks",
            uiLabel: "Create",
            sortOrder: 62,
            actionKey: "create"
          }),
          definePermission({
            constantKey: "APPOINTMENTS_BREAKS_UPDATE",
            code: "appointments.breaks.update",
            label: "Update Appointment Breaks",
            uiLabel: "Edit",
            sortOrder: 63,
            actionKey: "update"
          }),
          definePermission({
            constantKey: "APPOINTMENTS_BREAKS_DELETE",
            code: "appointments.breaks.delete",
            label: "Delete Appointment Breaks",
            uiLabel: "Delete",
            sortOrder: 64,
            actionKey: "delete"
          })
        ]
      }),
      defineFeature({
        key: "appointments.work_schedule",
        label: "Work Schedule",
        sortOrder: 30,
        permissions: [
          definePermission({
            constantKey: "APPOINTMENTS_SUBMENU_WORK_SCHEDULE",
            code: "appointments.work-schedule",
            label: "Appointments Work Schedule Submenu",
            uiLabel: "Open",
            sortOrder: 65,
            actionKey: "open"
          }),
          definePermission({
            constantKey: "APPOINTMENTS_WORK_SCHEDULE_READ",
            code: "appointments.work-schedule.read",
            label: "Read Work Schedule",
            uiLabel: "Read",
            sortOrder: 66,
            actionKey: "read",
            featureKeys: ["appointments.work_schedule"]
          }),
          definePermission({
            constantKey: "APPOINTMENTS_WORK_SCHEDULE_CREATE",
            code: "appointments.work-schedule.create",
            label: "Create Work Schedule",
            uiLabel: "Create",
            sortOrder: 67,
            actionKey: "create",
            featureKeys: ["appointments.work_schedule"]
          }),
          definePermission({
            constantKey: "APPOINTMENTS_WORK_SCHEDULE_UPDATE",
            code: "appointments.work-schedule.update",
            label: "Update Work Schedule",
            uiLabel: "Edit",
            sortOrder: 68,
            actionKey: "update",
            featureKeys: ["appointments.work_schedule"]
          }),
          definePermission({
            constantKey: "APPOINTMENTS_WORK_SCHEDULE_DELETE",
            code: "appointments.work-schedule.delete",
            label: "Delete Work Schedule",
            uiLabel: "Delete",
            sortOrder: 69,
            actionKey: "delete",
            featureKeys: ["appointments.work_schedule"]
          })
        ]
      })
    ]
  }),
  defineMenu({
    key: "statistics",
    label: "Statistics",
    sortOrder: 70,
    children: [
      defineFeature({
        key: "statistics.class_attendance",
        label: "VIP Class Attendance",
        sortOrder: 10,
        permissions: [
          definePermission({
            constantKey: "APPOINTMENTS_STATISTICS_CLASS_ATTENDANCE",
            code: "appointments.statistics.class-attendance",
            label: "Statistics Class Attendance Read",
            uiLabel: "Read",
            sortOrder: 67,
            actionKey: "read"
          })
        ]
      }),
      defineFeature({
        key: "statistics.planner_report",
        label: "Lesson Status Report",
        sortOrder: 20,
        permissions: [
          definePermission({
            constantKey: "APPOINTMENTS_STATISTICS_PLANNER_REPORT",
            code: "appointments.statistics.planner-report",
            label: "Statistics Planner Report Read",
            uiLabel: "Read",
            sortOrder: 68,
            actionKey: "read"
          })
        ]
      })
    ]
  }),
  defineMenu({
    key: "settings",
    label: "Settings",
    sortOrder: 80,
    children: [
      defineFeature({
        key: "settings.appointments",
        label: "Appointments",
        sortOrder: 10,
        permissions: [
          definePermission({
            constantKey: "SETTINGS_APPOINTMENTS_READ",
            code: "settings.appointments.read",
            label: "Read Appointment Settings",
            uiLabel: "Read",
            sortOrder: 72,
            actionKey: "read",
            featureKeys: ["settings.appointments"]
          }),
          definePermission({
            constantKey: "SETTINGS_APPOINTMENTS_UPDATE",
            code: "settings.appointments.update",
            label: "Update Appointment Settings",
            uiLabel: "Edit",
            sortOrder: 73,
            actionKey: "update",
            featureKeys: ["settings.appointments"]
          })
        ]
      }),
      defineFeature({
        key: "settings.appointment_norms",
        label: "Appointment Norms",
        sortOrder: 20,
        defaultEnabled: false,
        permissions: [
          definePermission({
            constantKey: "SETTINGS_APPOINTMENT_NORMS_READ",
            code: "settings.appointment-norms.read",
            label: "Read Appointment Norm Settings",
            uiLabel: "Read",
            sortOrder: 74,
            actionKey: "read",
            featureKeys: ["settings.appointment_norms"]
          }),
          definePermission({
            constantKey: "SETTINGS_APPOINTMENT_NORMS_CREATE",
            code: "settings.appointment-norms.create",
            label: "Create Appointment Norm Settings",
            uiLabel: "Create",
            sortOrder: 75,
            actionKey: "create",
            featureKeys: ["settings.appointment_norms"]
          }),
          definePermission({
            constantKey: "SETTINGS_APPOINTMENT_NORMS_UPDATE",
            code: "settings.appointment-norms.update",
            label: "Update Appointment Norm Settings",
            uiLabel: "Edit",
            sortOrder: 76,
            actionKey: "update",
            featureKeys: ["settings.appointment_norms"]
          }),
          definePermission({
            constantKey: "SETTINGS_APPOINTMENT_NORMS_DELETE",
            code: "settings.appointment-norms.delete",
            label: "Delete Appointment Norm Settings",
            uiLabel: "Delete",
            sortOrder: 77,
            actionKey: "delete",
            featureKeys: ["settings.appointment_norms"]
          })
        ]
      }),
      defineFeature({
        key: "settings.roles",
        label: "Roles",
        sortOrder: 30,
        permissions: [
          definePermission({
            constantKey: "SETTINGS_ROLES_READ",
            code: "settings.roles.read",
            label: "Read Role Settings",
            uiLabel: "Read",
            sortOrder: 78,
            actionKey: "read"
          }),
          definePermission({
            constantKey: "SETTINGS_ROLES_CREATE",
            code: "settings.roles.create",
            label: "Create Role Settings",
            uiLabel: "Create",
            sortOrder: 79,
            actionKey: "create"
          }),
          definePermission({
            constantKey: "SETTINGS_ROLES_UPDATE",
            code: "settings.roles.update",
            label: "Update Role Settings",
            uiLabel: "Edit",
            sortOrder: 80,
            actionKey: "update"
          }),
          definePermission({
            constantKey: "SETTINGS_ROLES_DELETE",
            code: "settings.roles.delete",
            label: "Delete Role Settings",
            uiLabel: "Delete",
            sortOrder: 81,
            actionKey: "delete"
          })
        ]
      }),
      defineFeature({
        key: "settings.positions",
        label: "Positions",
        sortOrder: 40,
        permissions: [
          definePermission({
            constantKey: "SETTINGS_POSITIONS_READ",
            code: "settings.positions.read",
            label: "Read Position Settings",
            uiLabel: "Read",
            sortOrder: 82,
            actionKey: "read"
          }),
          definePermission({
            constantKey: "SETTINGS_POSITIONS_CREATE",
            code: "settings.positions.create",
            label: "Create Position Settings",
            uiLabel: "Create",
            sortOrder: 83,
            actionKey: "create"
          }),
          definePermission({
            constantKey: "SETTINGS_POSITIONS_UPDATE",
            code: "settings.positions.update",
            label: "Update Position Settings",
            uiLabel: "Edit",
            sortOrder: 84,
            actionKey: "update"
          }),
          definePermission({
            constantKey: "SETTINGS_POSITIONS_DELETE",
            code: "settings.positions.delete",
            label: "Delete Position Settings",
            uiLabel: "Delete",
            sortOrder: 85,
            actionKey: "delete"
          })
        ]
      })
    ]
  }),
  defineMenu({
    key: "notifications",
    label: "Notifications",
    sortOrder: 90,
    showInOrgFeatures: true,
    rootPermissionsLabel: "Notifications",
    rootPermissions: [
      definePermission({
        constantKey: "NOTIFICATIONS_SEND",
        code: "notifications.send",
        label: "Send Notifications",
        uiLabel: "Send",
        sortOrder: 69,
        actionKey: "send"
      }),
      definePermission({
        constantKey: "NOTIFICATIONS_NOTIFY_TO_MANAGER",
        code: "notifications.notify.to-manager",
        label: "Notify To Manager",
        uiLabel: "Notify Manager",
        sortOrder: 70,
        actionKey: "notify.to-manager"
      }),
      definePermission({
        constantKey: "NOTIFICATIONS_NOTIFY_TO_SPECIALIST",
        code: "notifications.notify.to-specialist",
        label: "Notify To Specialist",
        uiLabel: "Notify Specialist",
        sortOrder: 71,
        actionKey: "notify.to-specialist"
      })
    ]
  })
]);

export const ORG_FEATURE_TREE = deepFreeze(
  ACCESS_MENU_REGISTRY
    .filter((menu) => menu.showInOrgFeatures)
    .map((menu) => ({
      key: menu.key,
      label: menu.label,
      children: menu.children.map((feature) => ({
        key: feature.key,
        label: feature.label
      }))
    }))
);

export const ALL_ORG_FEATURE_KEYS = deepFreeze(
  ACCESS_MENU_REGISTRY
    .filter((menu) => menu.showInOrgFeatures)
    .flatMap((menu) => [menu.key, ...menu.children.map((feature) => feature.key)])
);

export const DEFAULT_DISABLED_FEATURE_KEYS = deepFreeze(
  new Set(
    ACCESS_MENU_REGISTRY
      .filter((menu) => menu.showInOrgFeatures)
      .flatMap((menu) => menu.children.filter((f) => !f.defaultEnabled).map((f) => f.key))
  )
);

export const PERMISSION_DEFINITIONS = deepFreeze(
  ACCESS_MENU_REGISTRY.flatMap((menu) => [
    ...menu.rootPermissions.map((permission) => ({
      ...permission,
      menuKey: menu.key,
      menuLabel: menu.label,
      featureKey: menu.key,
      featureLabel: menu.rootPermissionsLabel,
      displayKey: `${menu.key}.general`
    })),
    ...menu.children.flatMap((feature) => (
      feature.permissions.map((permission) => ({
        ...permission,
        menuKey: menu.key,
        menuLabel: menu.label,
        featureKey: feature.key,
        featureLabel: feature.label,
        displayKey: feature.key
      }))
    ))
  ])
);

export const UNIQUE_PERMISSION_DEFINITIONS = deepFreeze(
  Array.from(
    PERMISSION_DEFINITIONS.reduce((acc, permission) => {
      if (!acc.has(permission.code)) {
        acc.set(permission.code, permission);
      }
      return acc;
    }, new Map()).values()
  )
);

export const PERMISSION_CONSTANTS = deepFreeze(
  UNIQUE_PERMISSION_DEFINITIONS.reduce((acc, permission) => {
    if (permission.constantKey && !(permission.constantKey in acc)) {
      acc[permission.constantKey] = permission.code;
    }
    return acc;
  }, {})
);

export const KNOWN_PERMISSION_CODES = deepFreeze(
  UNIQUE_PERMISSION_DEFINITIONS
    .map((permission) => normalizeAccessKey(permission?.code))
    .filter(Boolean)
);

export const ROLE_PERMISSION_TEMPLATE = deepFreeze(
  ACCESS_MENU_REGISTRY.map((menu) => ({
    key: menu.key,
    label: menu.label,
    sortOrder: menu.sortOrder,
    children: [
      ...(menu.rootPermissions.length > 0
        ? [{
            key: `${menu.key}.general`,
            label: menu.rootPermissionsLabel,
            sortOrder: -1,
            featureKey: menu.showInOrgFeatures ? menu.key : null,
            permissions: menu.rootPermissions.map((permission) => ({
              code: permission.code,
              label: permission.uiLabel,
              actionKey: permission.actionKey
            }))
          }]
        : []),
      ...menu.children.map((feature) => ({
        key: feature.key,
        label: feature.label,
        sortOrder: feature.sortOrder,
        permissions: feature.permissions.map((permission) => ({
          code: permission.code,
          label: permission.uiLabel,
          actionKey: permission.actionKey
        }))
      }))
    ]
  }))
);

const ORG_FEATURE_KEY_SET = new Set(ALL_ORG_FEATURE_KEYS);
const KNOWN_PERMISSION_CODE_SET = new Set(KNOWN_PERMISSION_CODES);
const PERMISSION_DEFINITION_BY_CODE = new Map();
const FEATURE_DEFINITION_BY_KEY = new Map();
const MENU_DEFINITION_BY_KEY = new Map();
const PERMISSION_CODE_BY_FEATURE_ACTION = new Map();

ACCESS_MENU_REGISTRY.forEach((menu) => {
  MENU_DEFINITION_BY_KEY.set(menu.key, menu);
  menu.children.forEach((feature) => {
    FEATURE_DEFINITION_BY_KEY.set(feature.key, {
      ...feature,
      menuKey: menu.key,
      menuLabel: menu.label
    });
    feature.permissions.forEach((permission) => {
      PERMISSION_CODE_BY_FEATURE_ACTION.set(`${feature.key}:${permission.actionKey}`, permission.code);
    });
  });
  menu.rootPermissions.forEach((permission) => {
    PERMISSION_CODE_BY_FEATURE_ACTION.set(`${menu.key}:${permission.actionKey}`, permission.code);
  });
});

UNIQUE_PERMISSION_DEFINITIONS.forEach((permission) => {
  if (!PERMISSION_DEFINITION_BY_CODE.has(permission.code)) {
    PERMISSION_DEFINITION_BY_CODE.set(permission.code, permission);
  }
});

function normalizeAccessKey(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeAllowedFeatures(value) {
  if (!Array.isArray(value)) {
    return null;
  }

  return Array.from(
    new Set(
      value
        .map((item) => normalizeAccessKey(item))
        .filter((item) => ORG_FEATURE_KEY_SET.has(item))
    )
  );
}

export function hasAllowedFeature(allowedFeatures, featureKey) {
  const normalizedFeature = normalizeAccessKey(featureKey);
  if (!normalizedFeature) {
    return true;
  }
  if (!Array.isArray(allowedFeatures)) {
    // null = all features enabled (platform admin or unrestricted org)
    return true;
  }

  const featureSet = new Set(
    allowedFeatures
      .map((item) => normalizeAccessKey(item))
      .filter(Boolean)
  );
  const directChildrenPrefix = `${normalizedFeature}.`;
  const hasDirectChild = Array.from(featureSet).some((item) => item.startsWith(directChildrenPrefix));
  const dotIndex = normalizedFeature.indexOf(".");

  if (dotIndex === -1) {
    return featureSet.has(normalizedFeature) || hasDirectChild;
  }

  if (featureSet.has(normalizedFeature)) {
    return true;
  }

  const parentFeature = normalizedFeature.slice(0, dotIndex);
  if (!featureSet.has(parentFeature)) {
    return false;
  }

  // Features that require explicit opt-in are never auto-enabled by parent key alone
  if (DEFAULT_DISABLED_FEATURE_KEYS.has(normalizedFeature)) {
    return false;
  }

  const siblingPrefix = `${parentFeature}.`;
  const hasAnyExplicitChildSelection = Array.from(featureSet).some((item) => item.startsWith(siblingPrefix));
  return !hasAnyExplicitChildSelection;
}

export function getPermissionDefinition(permissionCode) {
  return PERMISSION_DEFINITION_BY_CODE.get(normalizeAccessKey(permissionCode)) || null;
}

export function isKnownPermissionCode(permissionCode) {
  return KNOWN_PERMISSION_CODE_SET.has(normalizeAccessKey(permissionCode));
}

export function filterKnownPermissionCodes(permissionCodes) {
  if (!Array.isArray(permissionCodes)) {
    return [];
  }

  return Array.from(
    new Set(
      permissionCodes
        .map((code) => normalizeAccessKey(code))
        .filter((code) => KNOWN_PERMISSION_CODE_SET.has(code))
    )
  );
}

export function getFeatureDefinition(featureKey) {
  return FEATURE_DEFINITION_BY_KEY.get(normalizeAccessKey(featureKey)) || null;
}

export function getMenuDefinition(menuKey) {
  return MENU_DEFINITION_BY_KEY.get(normalizeAccessKey(menuKey)) || null;
}

export function getFeatureKeysForPermissionCode(permissionCode) {
  const permission = getPermissionDefinition(permissionCode);
  return permission ? [...permission.featureKeys] : [];
}

export function getPrimaryFeatureKeyForPermissionCode(permissionCode) {
  const featureKeys = getFeatureKeysForPermissionCode(permissionCode);
  return featureKeys[0] || null;
}

export function findPermissionCode(featureKey, actionKey) {
  return PERMISSION_CODE_BY_FEATURE_ACTION.get(
    `${normalizeAccessKey(featureKey)}:${normalizeAccessKey(actionKey)}`
  ) || null;
}

export function isPermissionAllowedByFeatures(permissionCode, allowedFeatures) {
  const featureKeys = getFeatureKeysForPermissionCode(permissionCode);
  if (featureKeys.length === 0) {
    return true;
  }
  return featureKeys.some((featureKey) => hasAllowedFeature(allowedFeatures, featureKey));
}

export function filterPermissionCodesByFeatures(permissionCodes, allowedFeatures) {
  const normalizedCodes = Array.isArray(permissionCodes)
    ? permissionCodes
        .map((code) => normalizeAccessKey(code))
        .filter(Boolean)
    : [];

  return Array.from(
    new Set(
      normalizedCodes.filter((code) => isPermissionAllowedByFeatures(code, allowedFeatures))
    )
  );
}

export function filterPermissionOptionsByFeatures(permissionOptions, allowedFeatures) {
  if (!Array.isArray(permissionOptions)) {
    return [];
  }

  return permissionOptions.filter((item) => {
    const code = item?.code ?? item?.value;
    return isPermissionAllowedByFeatures(code, allowedFeatures);
  });
}
