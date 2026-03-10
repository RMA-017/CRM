import {
  dateYmdSchema,
  emailSchema,
  organizationCodeSchema,
  phoneSchema,
  positiveIntegerLikeSchema,
  stringLikeSchema
} from "../../lib/route-schemas.js";

export const profileRouteSchemas = Object.freeze({
  updateBody: {
    type: "object",
    additionalProperties: true,
    required: ["field"],
    properties: {
      field: {
        type: "string",
        enum: ["email", "fullName", "birthday", "password", "phone", "position"]
      },
      value: {
        anyOf: [
          stringLikeSchema,
          { type: "null" }
        ]
      },
      currentPassword: {
        type: "string",
        maxLength: 255
      },
      email: emailSchema,
      birthday: dateYmdSchema,
      phone: phoneSchema
    }
  },
  organizationContextBody: {
    type: "object",
    additionalProperties: true,
    anyOf: [
      { required: ["organizationId"] },
      { required: ["organization_id"] },
      { required: ["organizationCode"] },
      { required: ["organization_code"] }
    ],
    properties: {
      organizationId: positiveIntegerLikeSchema,
      organization_id: positiveIntegerLikeSchema,
      organizationCode: organizationCodeSchema,
      organization_code: organizationCodeSchema
    }
  }
});
