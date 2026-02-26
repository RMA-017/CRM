const positiveIntegerLikeSchema = {
  anyOf: [
    { type: "integer", minimum: 1 },
    { type: "string", pattern: "^[1-9]\\d*$" }
  ]
};

const integerLikeSchema = {
  anyOf: [
    { type: "integer" },
    { type: "string", pattern: "^-?\\d+$" }
  ]
};

const booleanLikeSchema = {
  anyOf: [
    { type: "boolean" },
    { type: "integer", enum: [0, 1] },
    { type: "string" }
  ]
};

const organizationBodySchema = {
  type: "object",
  additionalProperties: true,
  required: ["code", "name"],
  properties: {
    code: { type: "string", minLength: 2, maxLength: 64, pattern: "^[a-z0-9._-]{2,64}$" },
    name: { type: "string", minLength: 1, maxLength: 128 },
    isActive: booleanLikeSchema
  }
};

const roleBodySchema = {
  type: "object",
  additionalProperties: true,
  required: ["label"],
  properties: {
    label: { type: "string", minLength: 1, maxLength: 64 },
    sortOrder: integerLikeSchema,
    isActive: booleanLikeSchema,
    permissionCodes: {
      type: "array",
      items: { type: "string", pattern: "^[a-z0-9._-]{2,64}$" }
    }
  }
};

const positionBodySchema = {
  type: "object",
  additionalProperties: true,
  required: ["label"],
  properties: {
    label: { type: "string", minLength: 1, maxLength: 96 },
    sortOrder: integerLikeSchema,
    isActive: booleanLikeSchema
  }
};

export const settingsRouteSchemas = Object.freeze({
  idParams: {
    type: "object",
    additionalProperties: true,
    required: ["id"],
    properties: {
      id: positiveIntegerLikeSchema
    }
  },
  organizationCreateBody: organizationBodySchema,
  organizationUpdateBody: organizationBodySchema,
  adminOptionsQuery: {
    type: "object",
    additionalProperties: true,
    properties: {
      organizationId: positiveIntegerLikeSchema,
      organization_id: positiveIntegerLikeSchema
    }
  },
  adminOptionsPatchBody: {
    type: "object",
    additionalProperties: true,
    properties: {
      organizationId: positiveIntegerLikeSchema,
      organization_id: positiveIntegerLikeSchema,
      appointmentHistoryLockDays: integerLikeSchema,
      historyLockDays: integerLikeSchema,
      appointment_history_lock_days: integerLikeSchema
    },
    anyOf: [
      { required: ["appointmentHistoryLockDays"] },
      { required: ["historyLockDays"] },
      { required: ["appointment_history_lock_days"] }
    ]
  },
  roleCreateBody: roleBodySchema,
  roleUpdateBody: roleBodySchema,
  positionCreateBody: positionBodySchema,
  positionUpdateBody: positionBodySchema
});

