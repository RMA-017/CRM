import {
  buildIdParamsSchema,
  dateYmdSchema,
  emailSchema,
  organizationCodeSchema,
  phoneSchema,
  positiveIntegerLikeSchema,
  usernameSchema
} from "../../lib/route-schemas.js";

const blankStringSchema = Object.freeze({
  type: "string",
  maxLength: 0
});

function allowBlank(schema) {
  return {
    anyOf: [
      schema,
      blankStringSchema
    ]
  };
}

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
      email: allowBlank(emailSchema),
      fullName: {
        type: "string",
        minLength: 1,
        maxLength: 64
      },
      birthday: allowBlank(dateYmdSchema),
      phone: allowBlank(phoneSchema),
      position: allowBlank(positiveIntegerLikeSchema),
      role: positiveIntegerLikeSchema,
      organizationCode: allowBlank(organizationCodeSchema),
      password: {
        type: "string",
        minLength: 0,
        maxLength: 255
      }
    }
  }
});
