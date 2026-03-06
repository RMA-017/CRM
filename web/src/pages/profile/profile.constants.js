export const LOGOUT_FLAG_KEY = "crm_just_logged_out";
export const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,30}$/;
export const ORGANIZATION_CODE_REGEX = /^[a-z0-9._-]{2,64}$/;
export const ALL_USERS_LIMIT = 20;

export const EMPTY_PROFILE_EDIT_FORM = {
  email: "",
  fullName: "",
  birthday: "",
  phone: "",
  position: ""
};

export const ORG_FEATURE_TREE = [
  {
    key: "clients",
    label: "Clients",
    children: [{ key: "clients.all_clients", label: "All Clients" }]
  },
  {
    key: "vip_clients",
    label: "VIP Clients",
    children: [
      { key: "vip_clients.my_class", label: "My Class" },
      { key: "vip_clients.attendance", label: "Attendance" },
      { key: "vip_clients.my_children", label: "My Children" },
      { key: "vip_clients.daily_routines", label: "Daily Routines" }
    ]
  },
  {
    key: "assignments",
    label: "Assignments",
    children: [
      { key: "assignments.class", label: "Class" },
      { key: "assignments.tutor", label: "Tutor" }
    ]
  },
  {
    key: "appointments",
    label: "Appointments",
    children: [
      { key: "appointments.planner", label: "Planner" },
      { key: "appointments.breaks", label: "Breaks" }
    ]
  },
  {
    key: "users",
    label: "Users",
    children: [{ key: "users.all_users", label: "All Users" }]
  },
  {
    key: "statistics",
    label: "Statistics",
    children: [
      { key: "statistics.class_attendance", label: "VIP Class Attendance" },
      { key: "statistics.planner_report", label: "Lesson Status Report" }
    ]
  }
];

export const ALL_ORG_FEATURE_KEYS = ORG_FEATURE_TREE.flatMap(({ key, children }) => [key, ...children.map((c) => c.key)]);

export const EMPTY_ORGANIZATION_FORM = {
  code: "",
  name: "",
  isActive: true,
  allowedFeatures: null
};

export const EMPTY_SETTINGS_OPTION_FORM = {
  label: "",
  sortOrder: "0",
  isActive: true
};

export const EMPTY_ROLE_CREATE_FORM = { ...EMPTY_SETTINGS_OPTION_FORM, isAdmin: false };

export const EMPTY_ROLE_EDIT_FORM = {
  ...EMPTY_SETTINGS_OPTION_FORM,
  permissionCodes: []
};

const EMPTY_ALL_USERS_EDIT_FORM = {
  organizationName: "",
  organizationCode: "",
  username: "",
  email: "",
  fullName: "",
  birthday: "",
  phone: "",
  position: "",
  role: "",
  password: ""
};

export function createEmptyProfileEditState() {
  return {
    open: false,
    mode: "profile",
    form: { ...EMPTY_PROFILE_EDIT_FORM },
    currentPassword: "",
    newPassword: "",
    error: "",
    errorField: "",
    submitting: false
  };
}

export function createEmptyAllUsersEditState() {
  return {
    open: false,
    id: "",
    submitting: false,
    form: { ...EMPTY_ALL_USERS_EDIT_FORM },
    errors: {}
  };
}

export function createEmptyAllUsersDeleteState() {
  return {
    open: false,
    id: "",
    error: "",
    submitting: false
  };
}

export function createEmptySettingsDeleteState() {
  return {
    open: false,
    type: "",
    id: "",
    label: "",
    error: "",
    submitting: false
  };
}

export function createEmptyClientsDeleteState() {
  return {
    open: false,
    id: "",
    label: "",
    error: "",
    submitting: false
  };
}
