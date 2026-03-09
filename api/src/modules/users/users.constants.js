import { USERNAME_REGEX } from "../../constants/validation.js";
import { PERMISSION_CONSTANTS } from "../../../../shared/access-registry.js";

export { USERNAME_REGEX };

export const PERMISSIONS = Object.freeze({ ...PERMISSION_CONSTANTS });
