import {
  buildIdParamsSchema,
  dateYmdSchema,
  emailSchema,
  organizationCodeSchema,
  phoneSchema,
  positiveIntegerLikeSchema,
  usernameSchema
} from "../../lib/route-schemas.js";

export const usersRouteSchemas = Object.freeze({
  listQuery: {
    type: "object",
    additionalProperties: true,
    properties: {
      page: positiveIntegerLikeSchema,
      limit: positiveIntegerLikeSchema,
      organizationCode: organizationCodeSchema,
      q: {
        type: "string",
        maxLength: 255
      }
    }
  },
  idParams: buildIdParamsSchema("id"),
  createBody: {
    type: "object",
    additionalProperties: true,
    properties: {
      username: usernameSchema,
      fullName: {
        type: "string",
        minLength: 1,
        maxLength: 64
      },
      full_name: {
        type: "string",
        minLength: 1,
        maxLength: 64
      },
      role: positiveIntegerLikeSchema,
      organizationCode: organizationCodeSchema
    }
  },
  updateBody: {
    type: "object",
    additionalProperties: true,
    properties: {
      username: usernameSchema,
      email: emailSchema,
      fullName: {
        type: "string",
        minLength: 1,
        maxLength: 64
      },
      birthday: dateYmdSchema,
      phone: phoneSchema,
      position: positiveIntegerLikeSchema,
      role: positiveIntegerLikeSchema,
      organizationCode: organizationCodeSchema,
      password: {
        type: "string",
        minLength: 0,
        maxLength: 255
      }
    }
  }
});
