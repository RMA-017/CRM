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

const workScheduleDayOfWeekSchema = {
  anyOf: [
    { type: "integer", minimum: 1, maximum: 7 },
    { type: "string", pattern: "^[1-7]$" }
  ]
};

const workScheduleDefaultWeeklyItemSchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    dayOfWeek: workScheduleDayOfWeekSchema,
    day_of_week: workScheduleDayOfWeekSchema,
    dayKey: dayKeySchema,
    isActive: booleanLikeSchema,
    is_active: booleanLikeSchema,
    startTime: timeHmSchema,
    start_time: timeHmSchema,
    endTime: timeHmSchema,
    end_time: timeHmSchema,
    reason: { type: "string", maxLength: 120 }
  }
};

const repeatPayloadSchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    enabled: booleanLikeSchema,
    untilDate: dateYmdSchema,
    autoRolling: booleanLikeSchema,
    dayKeys: {
      type: "array",
      items: dayKeySchema
    },
    skipConflicts: booleanLikeSchema
  }
};

export const appointmentRouteSchemas = Object.freeze({
  absencesQuery: {
    type: "object",
    additionalProperties: true,
    properties: {
      specialistId: positiveIntegerLikeSchema,
      dateFrom: dateYmdSchema,
      dateTo: dateYmdSchema
    }
  },
  absenceCreateBody: {
    type: "object",
    additionalProperties: true,
    anyOf: [
      { required: ["absenceDate"] },
      { required: ["dateFrom"] }
    ],
    properties: {
      specialistId: positiveIntegerLikeSchema,
      absenceDate: dateYmdSchema,
      dateFrom: dateYmdSchema,
      dateTo: dateYmdSchema,
      reason: { type: "string", maxLength: 120 }
    }
  },
  absenceIdParams: {
    type: "object",
    additionalProperties: true,
    required: ["id"],
    properties: {
      id: positiveIntegerLikeSchema
    }
  },
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
      { required: ["clientId"] },
      { required: ["classId"] }
    ],
    properties: {
      specialistId: positiveIntegerLikeSchema,
      clientId: positiveIntegerLikeSchema,
      classId: positiveIntegerLikeSchema,
      dateFrom: dateYmdSchema,
      dateTo: dateYmdSchema,
      vipOnly: booleanLikeSchema,
      vip_only: booleanLikeSchema,
      light: booleanLikeSchema,
      lite: booleanLikeSchema,
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
      organization_id: positiveIntegerLikeSchema,
      specialistId: positiveIntegerLikeSchema,
      specialist_id: positiveIntegerLikeSchema
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
      historyLockDays: {
        anyOf: [
          { type: "integer", minimum: 0 },
          { type: "string", pattern: "^\\d+$" }
        ]
      },
      appointmentHistoryLockDays: {
        anyOf: [
          { type: "integer", minimum: 0 },
          { type: "string", pattern: "^\\d+$" }
        ]
      },
      history_lock_days: {
        anyOf: [
          { type: "integer", minimum: 0 },
          { type: "string", pattern: "^\\d+$" }
        ]
      },
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
      outboxWorkerRetentionDays: {
        anyOf: [
          { type: "integer", minimum: 0 },
          { type: "string", pattern: "^\\d+$" }
        ]
      },
      outboxRetentionDays: {
        anyOf: [
          { type: "integer", minimum: 0 },
          { type: "string", pattern: "^\\d+$" }
        ]
      },
      outbox_worker_retention_days: {
        anyOf: [
          { type: "integer", minimum: 0 },
          { type: "string", pattern: "^\\d+$" }
        ]
      },
      userNotificationsRetentionDays: {
        anyOf: [
          { type: "integer", minimum: 0 },
          { type: "string", pattern: "^\\d+$" }
        ]
      },
      user_notifications_retention_days: {
        anyOf: [
          { type: "integer", minimum: 0 },
          { type: "string", pattern: "^\\d+$" }
        ]
      },
      visibleWeekDays: {
        type: "array",
        items: dayKeySchema
      },
      defaultWeeklyItems: {
        type: "array",
        items: workScheduleDefaultWeeklyItemSchema
      },
      default_weekly_items: {
        type: "array",
        items: workScheduleDefaultWeeklyItemSchema
      }
    }
  },
  workScheduleQuery: {
    type: "object",
    additionalProperties: true,
    properties: {
      organizationId: positiveIntegerLikeSchema,
      organization_id: positiveIntegerLikeSchema,
      userId: positiveIntegerLikeSchema,
      user_id: positiveIntegerLikeSchema,
      ruleScope: {
        type: "string",
        enum: ["weekly", "exception", "all"]
      },
      rule_scope: {
        type: "string",
        enum: ["weekly", "exception", "all"]
      }
    }
  },
  workScheduleDefaultWeeklyBody: {
    type: "object",
    additionalProperties: true,
    required: ["items"],
    properties: {
      organizationId: positiveIntegerLikeSchema,
      organization_id: positiveIntegerLikeSchema,
      items: {
        type: "array",
        items: workScheduleDefaultWeeklyItemSchema
      }
    }
  },
  workScheduleCreateBody: {
    type: "object",
    additionalProperties: true,
    properties: {
      organizationId: positiveIntegerLikeSchema,
      organization_id: positiveIntegerLikeSchema,
      userId: positiveIntegerLikeSchema,
      user_id: positiveIntegerLikeSchema,
      ruleScope: {
        type: "string",
        enum: ["weekly", "exception"]
      },
      rule_scope: {
        type: "string",
        enum: ["weekly", "exception"]
      },
      dayOfWeek: {
        anyOf: [
          { type: "integer", minimum: 1, maximum: 7 },
          { type: "string", pattern: "^[1-7]$" }
        ]
      },
      day_of_week: {
        anyOf: [
          { type: "integer", minimum: 1, maximum: 7 },
          { type: "string", pattern: "^[1-7]$" }
        ]
      },
      dayKey: dayKeySchema,
      workDate: dateYmdSchema,
      work_date: dateYmdSchema,
      isActive: booleanLikeSchema,
      is_active: booleanLikeSchema,
      startTime: timeHmSchema,
      start_time: timeHmSchema,
      endTime: timeHmSchema,
      end_time: timeHmSchema,
      reason: { type: "string", maxLength: 120 }
    }
  },
  workScheduleUpdateBody: {
    type: "object",
    additionalProperties: true,
    properties: {
      organizationId: positiveIntegerLikeSchema,
      organization_id: positiveIntegerLikeSchema,
      userId: positiveIntegerLikeSchema,
      user_id: positiveIntegerLikeSchema,
      ruleScope: {
        type: "string",
        enum: ["weekly", "exception"]
      },
      rule_scope: {
        type: "string",
        enum: ["weekly", "exception"]
      },
      dayOfWeek: {
        anyOf: [
          { type: "integer", minimum: 1, maximum: 7 },
          { type: "string", pattern: "^[1-7]$" }
        ]
      },
      day_of_week: {
        anyOf: [
          { type: "integer", minimum: 1, maximum: 7 },
          { type: "string", pattern: "^[1-7]$" }
        ]
      },
      dayKey: dayKeySchema,
      workDate: dateYmdSchema,
      work_date: dateYmdSchema,
      isActive: booleanLikeSchema,
      is_active: booleanLikeSchema,
      startTime: timeHmSchema,
      start_time: timeHmSchema,
      endTime: timeHmSchema,
      end_time: timeHmSchema,
      reason: { type: "string", maxLength: 120 }
    }
  },
  workScheduleIdParams: {
    type: "object",
    additionalProperties: true,
    required: ["id"],
    properties: {
      id: positiveIntegerLikeSchema
    }
  }
});
