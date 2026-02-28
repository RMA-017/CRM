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

const dayKeySchema = {
  type: "string",
  enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
};

const dateYmdSchema = {
  type: "string",
  pattern: "^\\d{4}-\\d{2}-\\d{2}$"
};

const timeHmSchema = {
  type: "string",
  pattern: "^([01]\\d|2[0-3]):[0-5]\\d$"
};

const repeatPayloadSchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    enabled: booleanLikeSchema,
    untilDate: dateYmdSchema,
    dayKeys: {
      type: "array",
      items: dayKeySchema
    },
    skipConflicts: booleanLikeSchema
  }
};

export const appointmentRouteSchemas = Object.freeze({
  clientNoShowSummaryQuery: {
    type: "object",
    additionalProperties: true,
    required: ["clientId"],
    properties: {
      clientId: positiveIntegerLikeSchema
    }
  },
  breaksQuery: {
    type: "object",
    additionalProperties: true,
    required: ["specialistId"],
    properties: {
      specialistId: positiveIntegerLikeSchema
    }
  },
  breaksUpdateBody: {
    type: "object",
    additionalProperties: true,
    required: ["specialistId", "items"],
    properties: {
      specialistId: positiveIntegerLikeSchema,
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: true,
          properties: {
            dayOfWeek: {
              anyOf: [
                { type: "integer", minimum: 1, maximum: 7 },
                { type: "string", pattern: "^[1-7]$" }
              ]
            },
            dayKey: dayKeySchema,
            breakType: {
              type: "string",
              enum: ["lunch", "meeting", "training", "other"]
            },
            title: { type: "string", maxLength: 120 },
            note: { type: "string", maxLength: 255 },
            startTime: timeHmSchema,
            endTime: timeHmSchema,
            isActive: booleanLikeSchema
          }
        }
      }
    }
  },
  schedulesQuery: {
    type: "object",
    additionalProperties: true,
    required: ["dateFrom", "dateTo"],
    anyOf: [
      { required: ["specialistId"] },
      { required: ["clientId"] }
    ],
    properties: {
      specialistId: positiveIntegerLikeSchema,
      clientId: positiveIntegerLikeSchema,
      dateFrom: dateYmdSchema,
      dateTo: dateYmdSchema,
      vipOnly: booleanLikeSchema,
      vip_only: booleanLikeSchema,
      recurringOnly: booleanLikeSchema,
      recurring_only: booleanLikeSchema
    }
  },
  scheduleCreateBody: {
    type: "object",
    additionalProperties: true,
    properties: {
      specialistId: positiveIntegerLikeSchema,
      clientId: positiveIntegerLikeSchema,
      appointmentDate: dateYmdSchema,
      startTime: timeHmSchema,
      endTime: timeHmSchema,
      durationMinutes: positiveIntegerLikeSchema,
      service: { type: "string" },
      serviceName: { type: "string" },
      status: {
        type: "string",
        enum: ["pending", "confirmed", "cancelled", "no-show"]
      },
      note: { type: "string" },
      repeat: repeatPayloadSchema
    }
  },
  scheduleUpdateBody: {
    type: "object",
    additionalProperties: true,
    properties: {
      specialistId: positiveIntegerLikeSchema,
      clientId: positiveIntegerLikeSchema,
      appointmentDate: dateYmdSchema,
      startTime: timeHmSchema,
      endTime: timeHmSchema,
      durationMinutes: positiveIntegerLikeSchema,
      service: { type: "string" },
      serviceName: { type: "string" },
      status: {
        type: "string",
        enum: ["pending", "confirmed", "cancelled", "no-show"]
      },
      note: { type: "string" },
      repeat: repeatPayloadSchema
    }
  },
  scheduleIdParams: {
    type: "object",
    additionalProperties: true,
    required: ["id"],
    properties: {
      id: positiveIntegerLikeSchema
    }
  },
  scheduleScopeQuery: {
    type: "object",
    additionalProperties: true,
    required: ["scope"],
    properties: {
      scope: {
        type: "string",
        enum: ["single", "future", "all"]
      }
    }
  },
  settingsQuery: {
    type: "object",
    additionalProperties: true,
    properties: {
      organizationId: positiveIntegerLikeSchema,
      organization_id: positiveIntegerLikeSchema
    }
  },
  settingsPatchBody: {
    type: "object",
    additionalProperties: true,
    properties: {
      organizationId: positiveIntegerLikeSchema,
      organization_id: positiveIntegerLikeSchema,
      slotInterval: positiveIntegerLikeSchema,
      slotSubDivisions: positiveIntegerLikeSchema,
      slotCellHeightPx: positiveIntegerLikeSchema,
      appointmentSlotCellHeightPx: positiveIntegerLikeSchema,
      slot_cell_height_px: positiveIntegerLikeSchema,
      appointmentDuration: positiveIntegerLikeSchema,
      appointmentDurationOptions: {
        type: "array",
        items: positiveIntegerLikeSchema
      },
      noShowThreshold: positiveIntegerLikeSchema,
      reminderHours: positiveIntegerLikeSchema,
      reminderChannels: {
        type: "array",
        items: {
          type: "string",
          enum: ["sms", "email", "telegram"]
        }
      },
      visibleWeekDays: {
        type: "array",
        items: dayKeySchema
      },
      workingHours: {
        type: "object",
        additionalProperties: true
      }
    }
  }
});
