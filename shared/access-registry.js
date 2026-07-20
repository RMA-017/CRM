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
        key: "appointments.notifications",
        label: "Appointment Notifications",
        sortOrder: 20,
        permissions: [
          definePermission({
            constantKey: "APPOINTMENTS_NOTIFICATIONS_RECEIVE",
            code: "appointments.notifications.receive",
            label: "Receive Appointment Notifications",
            uiLabel: "Receive",
            sortOrder: 60,
            actionKey: "receive"
          })
        ]
      })
    ]
  }),
  defineMenu({
    key: "crm",
    label: "CRM",
    sortOrder: 68,
    rootPermissionsLabel: "CRM",
    rootPermissions: [
      definePermission({
        constantKey: "CRM_LEADS_READ",
        code: "crm.leads.read",
        label: "Read CRM Leads",
        uiLabel: "Read",
        sortOrder: 67,
        actionKey: "read"
      }),
      definePermission({
        constantKey: "CRM_LEADS_UPDATE",
        code: "crm.leads.update",
        label: "Update CRM Leads",
        uiLabel: "Edit",
        sortOrder: 68,
        actionKey: "update"
      })
    ]
  }),
  defineMenu({
    key: "statistics",
    label: "Statistics",
    sortOrder: 70,
    children: [
      defineFeature({
        key: "statistics.planner_report",
        label: "Lesson Status Report",
        sortOrder: 10,
        permissions: [
          definePermission({
            constantKey: "APPOINTMENTS_STATISTICS_PLANNER_REPORT",
            code: "appointments.statistics.planner-report",
            label: "Statistics Planner Report Read",
            uiLabel: "Read",
            sortOrder: 68,
            actionKey: "read"
          }),
          definePermission({
            constantKey: "APPOINTMENTS_STATISTICS_PLANNER_REPORT_ONLY",
            code: "appointments.statistics.planner-report.only",
            label: "Statistics Planner Report Only",
            uiLabel: "Only",
            sortOrder: 69,
            actionKey: "assigned only"
          }),
          definePermission({
            constantKey: "APPOINTMENTS_STATISTICS_PLANNER_REPORT_ALL",
            code: "appointments.statistics.planner-report.all",
            label: "Statistics Planner Report All",
            uiLabel: "All",
            sortOrder: 70,
            actionKey: "all clients"
          })
        ]
      })
    ]
  }),
  defineMenu({
    key: "services",
    label: "Services",
    sortOrder: 72,
    rootPermissionsLabel: "Services",
    rootPermissions: [
      definePermission({
        constantKey: "SERVICES_READ",
        code: "services.read",
        label: "Read Services",
        uiLabel: "Read",
        sortOrder: 71,
        actionKey: "read"
      })
    ]
  }),
  defineMenu({
    key: "finance",
    label: "Finance",
    sortOrder: 73,
    children: [
      defineFeature({
        key: "finance.cashier",
        label: "Cashier",
        sortOrder: 10,
        permissions: [
          definePermission({
            constantKey: "FINANCE_CASHIER_READ",
            code: "finance.cashier.read",
            label: "Read Finance Cashier",
            uiLabel: "Read",
            sortOrder: 72,
            actionKey: "read"
          }),
          definePermission({
            constantKey: "FINANCE_CASHIER_CREATE",
            code: "finance.cashier.create",
            label: "Create Finance Tickets",
            uiLabel: "Create",
            sortOrder: 73,
            actionKey: "create"
          }),
          definePermission({
            constantKey: "FINANCE_CASHIER_UPDATE",
            code: "finance.cashier.update",
            label: "Update Finance Tickets",
            uiLabel: "Edit",
            sortOrder: 74,
            actionKey: "update"
          }),
          definePermission({
            constantKey: "FINANCE_CASHIER_PAY",
            code: "finance.cashier.pay",
            label: "Pay Finance Tickets",
            uiLabel: "Pay",
            sortOrder: 75,
            actionKey: "pay"
          })
        ]
      }),
      defineFeature({
        key: "finance.tickets",
        label: "Tickets",
        sortOrder: 20,
        permissions: [
          definePermission({
            constantKey: "FINANCE_TICKETS_READ",
            code: "finance.tickets.read",
            label: "Read Finance Tickets",
            uiLabel: "Read",
            sortOrder: 76,
            actionKey: "read"
          })
        ]
      }),
      defineFeature({
        key: "finance.reports",
        label: "Reports",
        sortOrder: 30,
        permissions: [
          definePermission({
            constantKey: "FINANCE_REPORTS_READ",
            code: "finance.reports.read",
            label: "Read Finance Reports",
            uiLabel: "Read",
            sortOrder: 77,
            actionKey: "read"
          })
        ]
      }),
      defineFeature({
        key: "finance.audit",
        label: "Audit",
        sortOrder: 35,
        permissions: [
          definePermission({
            constantKey: "FINANCE_AUDIT_READ",
            code: "finance.audit.read",
            label: "Read Finance Audit",
            uiLabel: "Read",
            sortOrder: 78,
            actionKey: "read"
          })
        ]
      }),
      defineFeature({
        key: "finance.transactions",
        label: "Transactions",
        sortOrder: 40,
        permissions: [
          definePermission({
            constantKey: "FINANCE_TRANSACTIONS_READ",
            code: "finance.transactions.read",
            label: "Read Finance Transactions",
            uiLabel: "Read",
            sortOrder: 78,
            actionKey: "read"
          })
        ]
      }),
      defineFeature({
        key: "finance.balances",
        label: "Client Balances",
        sortOrder: 50,
        permissions: [
          definePermission({
            constantKey: "FINANCE_BALANCES_READ",
            code: "finance.balances.read",
            label: "Read Finance Client Balances",
            uiLabel: "Read",
            sortOrder: 79,
            actionKey: "read"
          }),
          definePermission({
            constantKey: "FINANCE_BALANCES_UPDATE",
            code: "finance.balances.update",
            label: "Update Finance Client Balances",
            uiLabel: "Edit",
            sortOrder: 80,
            actionKey: "update"
          })
        ]
      }),
      defineFeature({
        key: "finance.daily_cash",
        label: "Daily Cash",
        sortOrder: 60,
        permissions: [
          definePermission({
            constantKey: "FINANCE_DAILY_CASH_READ",
            code: "finance.daily_cash.read",
            label: "Read Finance Daily Cash",
            uiLabel: "Read",
            sortOrder: 81,
            actionKey: "read"
          })
        ]
      }),
      defineFeature({
        key: "finance.discounts",
        label: "Client Discounts",
        sortOrder: 70,
        permissions: [
          definePermission({
            constantKey: "FINANCE_DISCOUNTS_READ",
            code: "finance.discounts.read",
            label: "Read Finance Client Discounts",
            uiLabel: "Read",
            sortOrder: 82,
            actionKey: "read"
          }),
          definePermission({
            constantKey: "FINANCE_DISCOUNTS_CREATE",
            code: "finance.discounts.create",
            label: "Create Finance Client Discounts",
            uiLabel: "Create",
            sortOrder: 83,
            actionKey: "create"
          }),
          definePermission({
            constantKey: "FINANCE_DISCOUNTS_UPDATE",
            code: "finance.discounts.update",
            label: "Update Finance Client Discounts",
            uiLabel: "Edit",
            sortOrder: 84,
            actionKey: "update"
          })
        ]
      })
    ]
  }),
  defineMenu({
    key: "website",
    label: "Website Management",
    sortOrder: 75,
    children: [
      defineFeature({
        key: "website.management",
        label: "Website Management",
        sortOrder: 10,
        permissions: [
          definePermission({
            constantKey: "WEBSITE_MANAGEMENT_READ",
            code: "website.management.read",
            label: "Read Website Management",
            uiLabel: "Read",
            sortOrder: 69,
            actionKey: "read"
          }),
          definePermission({
            constantKey: "WEBSITE_MANAGEMENT_CREATE",
            code: "website.management.create",
            label: "Create Website Management",
            uiLabel: "Create",
            sortOrder: 70,
            actionKey: "create"
          }),
          definePermission({
            constantKey: "WEBSITE_MANAGEMENT_UPDATE",
            code: "website.management.update",
            label: "Update Website Management",
            uiLabel: "Edit",
            sortOrder: 71,
            actionKey: "update"
          }),
          definePermission({
            constantKey: "WEBSITE_MANAGEMENT_DELETE",
            code: "website.management.delete",
            label: "Delete Website Management",
            uiLabel: "Delete",
            sortOrder: 72,
            actionKey: "delete"
          })
        ]
      })
    ]
  }),
  defineMenu({
    key: "sms_notifications",
    label: "SMS xabarnoma",
    sortOrder: 78,
    rootPermissionsLabel: "SMS xabarnoma",
    rootPermissions: [
      definePermission({
        constantKey: "SMS_NOTIFICATIONS_READ",
        code: "sms-notifications.read",
        label: "Open SMS Notifications",
        uiLabel: "Open",
        sortOrder: 71,
        actionKey: "read"
      }),
      definePermission({
        constantKey: "SMS_NOTIFICATIONS_SEND",
        code: "sms-notifications.send",
        label: "Send SMS Notifications",
        uiLabel: "Send",
        sortOrder: 72,
        actionKey: "send"
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
        key: "settings.telegram_bot",
        label: "Telegram Bot",
        sortOrder: 15,
        permissions: [
          definePermission({
            constantKey: "SETTINGS_TELEGRAM_BOT_READ",
            code: "settings.telegram-bot.read",
            label: "Read Telegram Bot Settings",
            uiLabel: "Read",
            sortOrder: 74,
            actionKey: "read",
            featureKeys: ["settings.telegram_bot"]
          }),
          definePermission({
            constantKey: "SETTINGS_TELEGRAM_BOT_UPDATE",
            code: "settings.telegram-bot.update",
            label: "Update Telegram Bot Settings",
            uiLabel: "Edit",
            sortOrder: 75,
            actionKey: "update",
            featureKeys: ["settings.telegram_bot"]
          })
        ]
      }),
      defineFeature({
        key: "settings.roles",
        label: "Roles",
        sortOrder: 20,
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
        sortOrder: 30,
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
      }),
      defineFeature({
        key: "settings.services",
        label: "Services",
        sortOrder: 40,
        permissions: [
          definePermission({
            constantKey: "SETTINGS_SERVICES_READ",
            code: "settings.services.read",
            label: "Read Service Settings",
            uiLabel: "Read",
            sortOrder: 86,
            actionKey: "read"
          }),
          definePermission({
            constantKey: "SETTINGS_SERVICES_CREATE",
            code: "settings.services.create",
            label: "Create Service Settings",
            uiLabel: "Create",
            sortOrder: 87,
            actionKey: "create"
          }),
          definePermission({
            constantKey: "SETTINGS_SERVICES_UPDATE",
            code: "settings.services.update",
            label: "Update Service Settings",
            uiLabel: "Edit",
            sortOrder: 88,
            actionKey: "update"
          }),
          definePermission({
            constantKey: "SETTINGS_SERVICES_DELETE",
            code: "settings.services.delete",
            label: "Delete Service Settings",
            uiLabel: "Delete",
            sortOrder: 89,
            actionKey: "delete"
          })
        ]
      }),
      defineFeature({
        key: "settings.finance",
        label: "Finance",
        sortOrder: 50,
        permissions: [
          definePermission({
            constantKey: "SETTINGS_FINANCE_READ",
            code: "settings.finance.read",
            label: "Read Finance Settings",
            uiLabel: "Read",
            sortOrder: 90,
            actionKey: "read"
          }),
          definePermission({
            constantKey: "SETTINGS_FINANCE_CREATE",
            code: "settings.finance.create",
            label: "Create Finance Settings",
            uiLabel: "Create",
            sortOrder: 91,
            actionKey: "create"
          }),
          definePermission({
            constantKey: "SETTINGS_FINANCE_UPDATE",
            code: "settings.finance.update",
            label: "Update Finance Settings",
            uiLabel: "Edit",
            sortOrder: 92,
            actionKey: "update"
          }),
          definePermission({
            constantKey: "SETTINGS_FINANCE_DELETE",
            code: "settings.finance.delete",
            label: "Delete Finance Settings",
            uiLabel: "Delete",
            sortOrder: 93,
            actionKey: "delete"
          })
        ]
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
