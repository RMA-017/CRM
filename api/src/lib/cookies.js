import { appConfig } from "../config/app-config.js";

export const AUTH_COOKIE_NAME = "crm_access_token";
const ONE_WEEK_IN_SECONDS = 60 * 60 * 24 * 7;

export function getAuthCookieOptions() {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: appConfig.cookieSecure,
    maxAge: ONE_WEEK_IN_SECONDS
  };
}

export function getClearCookieOptions() {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: appConfig.cookieSecure
  };
}
