import { usernameSchema } from "../../lib/route-schemas.js";

export const authRouteSchemas = Object.freeze({
  loginBody: {
    type: "object",
    additionalProperties: true,
    properties: {
      username: usernameSchema,
      password: {
        type: "string",
        minLength: 1,
        maxLength: 255
      }
    }
  }
});
