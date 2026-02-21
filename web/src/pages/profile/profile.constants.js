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

export const EMPTY_ORGANIZATION_FORM = {
  code: "",
  name: "",
  isActive: true
};

export const EMPTY_SETTINGS_OPTION_FORM = {
  label: "",
  sortOrder: "0",
  isActive: true
};

export const EMPTY_ROLE_CREATE_FORM = { ...EMPTY_SETTINGS_OPTION_FORM };

export const EMPTY_ROLE_EDIT_FORM = {
  ...EMPTY_SETTINGS_OPTION_FORM,
  permissionCodes: []
};

export const EMPTY_ALL_USERS_EDIT_FORM = {
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
