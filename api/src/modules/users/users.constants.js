export const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,30}$/;

export const PERMISSIONS = Object.freeze({
  PROFILE_READ: "profile.read",
  PROFILE_UPDATE: "profile.update",
  USERS_READ: "users.read",
  USERS_CREATE: "users.create",
  USERS_UPDATE: "users.update",
  USERS_DELETE: "users.delete",
  CLIENTS_READ: "clients.read",
  APPOINTMENTS_READ: "appointments.read"
});
