import {
  organizationCodeSchema,
  positiveIntegerLikeSchema
} from "../../lib/route-schemas.js";

export const metaRouteSchemas = Object.freeze({
  userOptionsQuery: {
    type: "object",
    additionalProperties: true,
    properties: {
      organizationId: positiveIntegerLikeSchema,
      organization_id: positiveIntegerLikeSchema,
      organizationCode: organizationCodeSchema,
      organization_code: organizationCodeSchema
    }
  }
});
