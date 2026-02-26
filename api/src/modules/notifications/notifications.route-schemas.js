const positiveIntegerLikeSchema = {
  anyOf: [
    { type: "integer", minimum: 1 },
    { type: "string", pattern: "^[1-9]\\d*$" }
  ]
};

const booleanLikeSchema = {
  anyOf: [
    { type: "boolean" },
    { type: "integer", enum: [0, 1] },
    { type: "string" }
  ]
};

export const notificationsRouteSchemas = Object.freeze({
  listQuery: {
    type: "object",
    additionalProperties: true,
    properties: {
      unreadOnly: booleanLikeSchema,
      limit: positiveIntegerLikeSchema
    }
  },
  sendBody: {
    type: "object",
    additionalProperties: true,
    required: ["message"],
    properties: {
      message: { type: "string", minLength: 1, maxLength: 255 },
      targetUserIds: {
        anyOf: [
          positiveIntegerLikeSchema,
          {
            type: "array",
            items: positiveIntegerLikeSchema
          }
        ]
      },
      targetRoles: {
        anyOf: [
          { type: "string", minLength: 1, maxLength: 100 },
          {
            type: "array",
            items: { type: "string", minLength: 1, maxLength: 100 }
          }
        ]
      },
      payload: {
        type: "object",
        additionalProperties: true
      }
    }
  }
});

