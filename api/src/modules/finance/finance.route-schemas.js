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

const ticketItemSchema = {
  type: "object",
  additionalProperties: true,
  required: ["serviceId"],
  properties: {
    specialistId: positiveIntegerLikeSchema,
    specialist_id: positiveIntegerLikeSchema,
    serviceId: positiveIntegerLikeSchema,
    service_id: positiveIntegerLikeSchema,
    discountType: { type: "string", enum: ["amount", "percent"] },
    discount_type: { type: "string", enum: ["amount", "percent"] },
    discountValue: integerLikeSchema,
    discount_value: integerLikeSchema
  }
};

const ticketBatchPaymentMethodSchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    source: { type: "string", enum: ["method", "deposit"] },
    paymentSource: { type: "string", enum: ["method", "deposit"] },
    payment_source: { type: "string", enum: ["method", "deposit"] },
    paymentMethodId: positiveIntegerLikeSchema,
    payment_method_id: positiveIntegerLikeSchema,
    clientId: positiveIntegerLikeSchema,
    client_id: positiveIntegerLikeSchema,
    amountUzs: integerLikeSchema,
    amount_uzs: integerLikeSchema
  },
  anyOf: [
    { required: ["paymentMethodId", "amountUzs"] },
    { required: ["paymentMethodId", "amount_uzs"] },
    { required: ["payment_method_id", "amountUzs"] },
    { required: ["payment_method_id", "amount_uzs"] },
    { required: ["clientId", "amountUzs"] },
    { required: ["clientId", "amount_uzs"] },
    { required: ["client_id", "amountUzs"] },
    { required: ["client_id", "amount_uzs"] }
  ]
};

export const financeRouteSchemas = Object.freeze({
  idParams: {
    type: "object",
    additionalProperties: true,
    required: ["id"],
    properties: {
      id: positiveIntegerLikeSchema
    }
  },
  boardQuery: {
    type: "object",
    additionalProperties: true,
    properties: {
      dateFrom: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      dateTo: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      date_from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      date_to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      q: { type: "string", maxLength: 96 },
      query: { type: "string", maxLength: 96 },
      search: { type: "string", maxLength: 96 }
    }
  },
  clientSearchQuery: {
    type: "object",
    additionalProperties: true,
    properties: {
      q: { type: "string", maxLength: 96 },
      limit: positiveIntegerLikeSchema
    }
  },
  ticketListQuery: {
    type: "object",
    additionalProperties: true,
    properties: {
      ticketNumber: { type: "string", maxLength: 5 },
      ticket_number: { type: "string", maxLength: 5 },
      dateFrom: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      dateTo: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      date_from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      date_to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      client: { type: "string", maxLength: 96 },
      specialist: { type: "string", maxLength: 96 },
      position: { type: "string", maxLength: 96 },
      service: { type: "string", maxLength: 128 },
      status: { type: "string", maxLength: 64 },
      page: positiveIntegerLikeSchema,
      pageSize: positiveIntegerLikeSchema,
      page_size: positiveIntegerLikeSchema
    }
  },
  transactionListQuery: {
    type: "object",
    additionalProperties: true,
    properties: {
      dateFrom: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      dateTo: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      date_from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      date_to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      ticketNumber: { type: "string", maxLength: 5 },
      ticket_number: { type: "string", maxLength: 5 },
      client: { type: "string", maxLength: 96 },
      paymentMethodId: positiveIntegerLikeSchema,
      payment_method_id: positiveIntegerLikeSchema,
      page: positiveIntegerLikeSchema,
      pageSize: positiveIntegerLikeSchema,
      page_size: positiveIntegerLikeSchema
    }
  },
  transactionVoidBody: {
    type: "object",
    additionalProperties: true,
    required: ["reason"],
    properties: {
      reason: { type: "string", minLength: 3, maxLength: 255 }
    }
  },
  dailyCashQuery: {
    type: "object",
    additionalProperties: true,
    properties: {
      dateFrom: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      dateTo: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      date_from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      date_to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      cashier: { type: "string", maxLength: 96 },
      client: { type: "string", maxLength: 96 },
      service: { type: "string", maxLength: 128 },
      paymentMethodId: positiveIntegerLikeSchema,
      payment_method_id: positiveIntegerLikeSchema,
      sessionScope: { type: "string", enum: ["", "current", "all"] },
      session_scope: { type: "string", enum: ["", "current", "all"] },
      page: positiveIntegerLikeSchema,
      pageSize: positiveIntegerLikeSchema,
      page_size: positiveIntegerLikeSchema
    }
  },
  reportsQuery: {
    type: "object",
    additionalProperties: true,
    properties: {
      dateFrom: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      dateTo: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      date_from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      date_to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      ticketNumber: { type: "string", maxLength: 12 },
      ticket_number: { type: "string", maxLength: 12 },
      client: { type: "string", maxLength: 96 },
      clientId: positiveIntegerLikeSchema,
      client_id: positiveIntegerLikeSchema,
      service: { type: "string", maxLength: 128 },
      serviceId: positiveIntegerLikeSchema,
      service_id: positiveIntegerLikeSchema,
      specialist: { type: "string", maxLength: 96 },
      specialistId: positiveIntegerLikeSchema,
      specialist_id: positiveIntegerLikeSchema,
      position: { type: "string", maxLength: 96 },
      department: { type: "string", maxLength: 96 },
      positionId: positiveIntegerLikeSchema,
      position_id: positiveIntegerLikeSchema,
      cashier: { type: "string", maxLength: 96 },
      cashierId: positiveIntegerLikeSchema,
      cashier_id: positiveIntegerLikeSchema,
      paymentMethodId: positiveIntegerLikeSchema,
      payment_method_id: positiveIntegerLikeSchema,
      transactionType: { type: "string", maxLength: 64 },
      transaction_type: { type: "string", maxLength: 64 },
      transactionStatus: { type: "string", enum: ["", "posted", "voided"] },
      transaction_status: { type: "string", enum: ["", "posted", "voided"] },
      ticketStatus: { type: "string", enum: ["", "issued", "unpaid", "paid", "voided"] },
      ticket_status: { type: "string", enum: ["", "issued", "unpaid", "paid", "voided"] },
      includeVoided: { type: "string", enum: ["", "1", "true", "false", "yes", "no", "on", "off"] },
      include_voided: { type: "string", enum: ["", "1", "true", "false", "yes", "no", "on", "off"] },
      allDates: { type: "string", enum: ["", "1", "true", "false", "yes", "no", "on", "off"] },
      all_dates: { type: "string", enum: ["", "1", "true", "false", "yes", "no", "on", "off"] }
    }
  },
  clientBalanceListQuery: {
    type: "object",
    additionalProperties: true,
    properties: {
      client: { type: "string", maxLength: 96 },
      clientIds: { type: "string", maxLength: 512 },
      client_ids: { type: "string", maxLength: 512 },
      type: { type: "string", enum: ["", "all", "active", "debt", "deposit"] },
      page: positiveIntegerLikeSchema,
      pageSize: positiveIntegerLikeSchema,
      page_size: positiveIntegerLikeSchema
    }
  },
  clientDepositBody: {
    type: "object",
    additionalProperties: true,
    required: ["operation"],
    properties: {
      clientId: positiveIntegerLikeSchema,
      client_id: positiveIntegerLikeSchema,
      paymentMethodId: positiveIntegerLikeSchema,
      payment_method_id: positiveIntegerLikeSchema,
      amountUzs: positiveIntegerLikeSchema,
      amount_uzs: positiveIntegerLikeSchema,
      operation: { type: "string", enum: ["in", "out"] },
      note: { type: "string", maxLength: 255 }
    },
    anyOf: [
      { required: ["clientId", "paymentMethodId", "amountUzs"] },
      { required: ["client_id", "payment_method_id", "amount_uzs"] }
    ]
  },
  clientDepositTicketPaymentBody: {
    type: "object",
    additionalProperties: true,
    properties: {
      clientId: positiveIntegerLikeSchema,
      client_id: positiveIntegerLikeSchema,
      ticketIds: {
        type: "array",
        minItems: 1,
        maxItems: 50,
        items: positiveIntegerLikeSchema
      },
      ticket_ids: {
        type: "array",
        minItems: 1,
        maxItems: 50,
        items: positiveIntegerLikeSchema
      },
      note: { type: "string", maxLength: 255 }
    },
    anyOf: [
      { required: ["clientId", "ticketIds"] },
      { required: ["client_id", "ticket_ids"] }
    ]
  },
  cashSessionOpenBody: {
    type: "object",
    additionalProperties: true,
    properties: {
      openingBalanceUzs: integerLikeSchema,
      opening_balance_uzs: integerLikeSchema,
      note: { type: "string", maxLength: 255 }
    }
  },
  cashSessionCloseBody: {
    type: "object",
    additionalProperties: true,
    properties: {
      closingBalanceUzs: integerLikeSchema,
      closing_balance_uzs: integerLikeSchema,
      note: { type: "string", maxLength: 255 },
      closeNote: { type: "string", maxLength: 255 },
      close_note: { type: "string", maxLength: 255 }
    }
  },
  cashierAppointmentStatusBody: {
    type: "object",
    additionalProperties: true,
    required: ["status"],
    properties: {
      status: {
        type: "string",
        enum: ["pending", "confirmed", "cancelled", "no-show"]
      }
    }
  },
  ticketCreateBody: {
    type: "object",
    additionalProperties: true,
    properties: {
      appointmentScheduleId: positiveIntegerLikeSchema,
      appointment_schedule_id: positiveIntegerLikeSchema,
      ticketDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      ticket_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      clientId: positiveIntegerLikeSchema,
      client_id: positiveIntegerLikeSchema,
      serviceId: positiveIntegerLikeSchema,
      service_id: positiveIntegerLikeSchema,
      serviceName: { type: "string", minLength: 1, maxLength: 128 },
      service_name: { type: "string", minLength: 1, maxLength: 128 },
      amountUzs: integerLikeSchema,
      amount_uzs: integerLikeSchema,
      items: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        items: ticketItemSchema
      },
      note: { type: "string", maxLength: 255 },
      reason: { type: "string", maxLength: 255 },
      changeReason: { type: "string", maxLength: 255 },
      change_reason: { type: "string", maxLength: 255 }
    },
    anyOf: [
      { required: ["appointmentScheduleId"] },
      { required: ["appointment_schedule_id"] },
      { required: ["clientId", "items"] },
      { required: ["client_id", "items"] },
      { required: ["clientId", "serviceName"] },
      { required: ["client_id", "service_name"] }
    ]
  },
  ticketUpdateBody: {
    type: "object",
    additionalProperties: true,
    properties: {
      ticketDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      ticket_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      clientId: positiveIntegerLikeSchema,
      client_id: positiveIntegerLikeSchema,
      amountUzs: integerLikeSchema,
      amount_uzs: integerLikeSchema,
      items: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        items: ticketItemSchema
      },
      note: { type: "string", maxLength: 255 }
    },
    anyOf: [
      { required: ["ticketDate"] },
      { required: ["ticket_date"] },
      { required: ["clientId"] },
      { required: ["client_id"] },
      { required: ["amountUzs"] },
      { required: ["amount_uzs"] },
      { required: ["items"] },
      { required: ["note"] }
    ]
  },
  ticketVoidBody: {
    type: "object",
    additionalProperties: true,
    required: ["reason"],
    properties: {
      reason: { type: "string", minLength: 1, maxLength: 255 }
    }
  },
  ticketPaymentBody: {
    type: "object",
    additionalProperties: true,
    properties: {
      paymentMethodId: positiveIntegerLikeSchema,
      payment_method_id: positiveIntegerLikeSchema,
      amountUzs: integerLikeSchema,
      amount_uzs: integerLikeSchema,
      note: { type: "string", maxLength: 255 }
    },
    anyOf: [
      { required: ["paymentMethodId"] },
      { required: ["payment_method_id"] }
    ]
  },
  ticketBatchPaymentBody: {
    type: "object",
    additionalProperties: true,
    properties: {
      ticketIds: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        items: positiveIntegerLikeSchema
      },
      ticket_ids: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        items: positiveIntegerLikeSchema
      },
      payments: {
        type: "array",
        minItems: 1,
        maxItems: 8,
        items: ticketBatchPaymentMethodSchema
      },
      note: { type: "string", maxLength: 255 }
    },
    anyOf: [
      { required: ["ticketIds", "payments"] },
      { required: ["ticket_ids", "payments"] }
    ]
  },
  ticketRefundBody: {
    type: "object",
    additionalProperties: true,
    properties: {
      note: { type: "string", maxLength: 255 }
    }
  }
});
