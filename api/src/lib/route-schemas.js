export const positiveIntegerLikeSchema = Object.freeze({
  anyOf: [
    { type: "integer", minimum: 1 },
    { type: "string", pattern: "^[1-9]\\d*$" }
  ]
});

export const integerLikeSchema = Object.freeze({
  anyOf: [
    { type: "integer" },
    { type: "string", pattern: "^-?\\d+$" }
  ]
});

export const stringLikeSchema = Object.freeze({
  anyOf: [
    { type: "string" },
    { type: "integer" },
    { type: "number" }
  ]
});

export const booleanLikeSchema = Object.freeze({
  anyOf: [
    { type: "boolean" },
    { type: "integer", enum: [0, 1] },
    { type: "string" }
  ]
});

export const dateYmdSchema = Object.freeze({
  type: "string",
  pattern: "^\\d{4}-\\d{2}-\\d{2}$"
});

export const usernameSchema = Object.freeze({
  type: "string",
  minLength: 3,
  maxLength: 30,
  pattern: "^[a-zA-Z0-9._-]{3,30}$"
});

export const organizationCodeSchema = Object.freeze({
  type: "string",
  minLength: 2,
  maxLength: 64,
  pattern: "^[a-z0-9._-]{2,64}$"
});

export const emailSchema = Object.freeze({
  type: "string",
  minLength: 3,
  maxLength: 128,
  pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"
});

export const phoneSchema = Object.freeze({
  type: "string",
  pattern: "^\\+?[0-9]{7,15}$"
});

export function buildIdParamsSchema(key = "id") {
  return {
    type: "object",
    additionalProperties: true,
    required: [key],
    properties: {
      [key]: positiveIntegerLikeSchema
    }
  };
}
