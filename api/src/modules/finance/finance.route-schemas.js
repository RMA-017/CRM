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
      status: { type: "string", enum: ["", "issued", "paid", "unpaid", "voided"] },
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
      client: { type: "string", maxLength: 96 },
      paymentMethodId: positiveIntegerLikeSchema,
      payment_method_id: positiveIntegerLikeSchema,
      page: positiveIntegerLikeSchema,
      pageSize: positiveIntegerLikeSchema,
      page_size: positiveIntegerLikeSchema
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
      date_to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }
    }
  },
  clientBalanceListQuery: {
    type: "object",
    additionalProperties: true,
    properties: {
      client: { type: "string", maxLength: 96 },
      type: { type: "string", enum: ["", "all", "debt", "deposit"] },
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
      note: { type: "string", maxLength: 255 }
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
      amountUzs: integerLikeSchema,
      amount_uzs: integerLikeSchema,
      note: { type: "string", maxLength: 255 }
    },
    anyOf: [
      { required: ["amountUzs"] },
      { required: ["amount_uzs"] },
      { required: ["note"] }
    ]
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
  ticketRefundBody: {
    type: "object",
    additionalProperties: true,
    properties: {
      note: { type: "string", maxLength: 255 }
    }
  }
});
