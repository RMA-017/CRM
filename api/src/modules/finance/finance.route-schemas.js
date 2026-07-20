const positiveIntegerLikeSchema = {
  anyOf: [
    { type: "integer", minimum: 1 },
    { type: "string", pattern: "^[1-9]\\d*$" }
  ]
};

const booleanLikeSchema = {
  anyOf: [
    { type: "boolean" },
    { type: "string", enum: ["true", "false", "1", "0", "yes", "no", "on", "off"] }
  ]
};

const clientDiscountLimitCountSchema = {
  anyOf: [
    { type: "integer", minimum: 1, maximum: 22 },
    { type: "string", pattern: "^(?:[1-9]|1\\d|2[0-2])$" }
  ]
};

const nonNegativeIntegerLikeSchema = {
  anyOf: [
    { type: "integer", minimum: 0 },
    { type: "string", pattern: "^\\d+$" }
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
    priceUzs: integerLikeSchema,
    price_uzs: integerLikeSchema,
    amountUzs: integerLikeSchema,
    amount_uzs: integerLikeSchema,
    discountType: { type: "string", enum: ["amount", "percent"] },
    discount_type: { type: "string", enum: ["amount", "percent"] },
    discountValue: integerLikeSchema,
    discount_value: integerLikeSchema,
    discountUzs: nonNegativeIntegerLikeSchema,
    discount_uzs: nonNegativeIntegerLikeSchema
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
      search: { type: "string", maxLength: 96 },
      clientQuery: { type: "string", maxLength: 96 },
      client_query: { type: "string", maxLength: 96 },
      serviceId: positiveIntegerLikeSchema,
      service_id: positiveIntegerLikeSchema,
      specialistId: positiveIntegerLikeSchema,
      specialist_id: positiveIntegerLikeSchema,
      limit: positiveIntegerLikeSchema
    }
  },
  auditQuery: {
    type: "object",
    additionalProperties: true,
    properties: {
      limit: positiveIntegerLikeSchema
    }
  },
  discountListQuery: {
    type: "object",
    additionalProperties: true,
    properties: {
      q: { type: "string", maxLength: 96 },
      query: { type: "string", maxLength: 96 },
      search: { type: "string", maxLength: 96 },
      createdFrom: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      createdTo: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      created_from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      created_to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      createdAtFrom: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      createdAtTo: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      created_at_from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      created_at_to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      client: { type: "string", maxLength: 96 },
      clientName: { type: "string", maxLength: 96 },
      client_name: { type: "string", maxLength: 96 },
      service: { type: "string", maxLength: 128 },
      serviceName: { type: "string", maxLength: 128 },
      service_name: { type: "string", maxLength: 128 },
      status: { type: "string", maxLength: 32 },
      active: { type: "string", maxLength: 16 },
      isActive: booleanLikeSchema,
      is_active: booleanLikeSchema,
      page: positiveIntegerLikeSchema,
      pageSize: positiveIntegerLikeSchema,
      page_size: positiveIntegerLikeSchema
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
      ticketCreatedFrom: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      ticketCreatedTo: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      ticket_created_from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      ticket_created_to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
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
      ticketCreatedFrom: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      ticketCreatedTo: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      ticket_created_from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      ticket_created_to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      ticketDateFrom: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      ticketDateTo: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      ticket_date_from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      ticket_date_to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      paymentDateFrom: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      paymentDateTo: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      payment_date_from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      payment_date_to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      ticketNumber: { type: "string", maxLength: 12 },
      ticket_number: { type: "string", maxLength: 12 },
      client: { type: "string", maxLength: 96 },
      clientId: positiveIntegerLikeSchema,
      client_id: positiveIntegerLikeSchema,
      clientBirthdayFrom: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      clientBirthdayTo: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      client_birthday_from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      client_birthday_to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      clientGender: { type: "string", enum: ["", "male", "female"] },
      client_gender: { type: "string", enum: ["", "male", "female"] },
      clientPhone: { type: "string", maxLength: 32 },
      client_phone: { type: "string", maxLength: 32 },
      service: { type: "string", maxLength: 128 },
      serviceId: positiveIntegerLikeSchema,
      service_id: positiveIntegerLikeSchema,
      serviceAmountFrom: nonNegativeIntegerLikeSchema,
      serviceAmountTo: nonNegativeIntegerLikeSchema,
      service_amount_from: nonNegativeIntegerLikeSchema,
      service_amount_to: nonNegativeIntegerLikeSchema,
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
      ticketDiscountFrom: nonNegativeIntegerLikeSchema,
      ticketDiscountTo: nonNegativeIntegerLikeSchema,
      ticket_discount_from: nonNegativeIntegerLikeSchema,
      ticket_discount_to: nonNegativeIntegerLikeSchema,
      ticketToPayFrom: nonNegativeIntegerLikeSchema,
      ticketToPayTo: nonNegativeIntegerLikeSchema,
      ticket_to_pay_from: nonNegativeIntegerLikeSchema,
      ticket_to_pay_to: nonNegativeIntegerLikeSchema,
      ticketPaidFrom: nonNegativeIntegerLikeSchema,
      ticketPaidTo: nonNegativeIntegerLikeSchema,
      ticket_paid_from: nonNegativeIntegerLikeSchema,
      ticket_paid_to: nonNegativeIntegerLikeSchema,
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
  googleSheetsConfigQuery: {
    type: "object",
    additionalProperties: false,
    required: ["year"],
    properties: {
      year: {
        anyOf: [
          { type: "integer", minimum: 2000, maximum: 2100 },
          { type: "string", pattern: "^(20\\d{2}|2100)$" }
        ]
      }
    }
  },
  googleSheetsExportBody: {
    type: "object",
    additionalProperties: false,
    required: ["year", "spreadsheetUrl"],
    properties: {
      year: {
        anyOf: [
          { type: "integer", minimum: 2000, maximum: 2100 },
          { type: "string", pattern: "^(20\\d{2}|2100)$" }
        ]
      },
      spreadsheetUrl: {
        type: "string",
        minLength: 20,
        maxLength: 512
      }
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
  clientDepositTopUpBody: {
    type: "object",
    additionalProperties: true,
    properties: {
      clientId: positiveIntegerLikeSchema,
      client_id: positiveIntegerLikeSchema,
      paymentMethodId: positiveIntegerLikeSchema,
      payment_method_id: positiveIntegerLikeSchema,
      amountUzs: integerLikeSchema,
      amount_uzs: integerLikeSchema,
      note: { type: "string", maxLength: 255 }
    },
    anyOf: [
      { required: ["clientId", "paymentMethodId", "amountUzs"] },
      { required: ["client_id", "payment_method_id", "amount_uzs"] }
    ]
  },
  clientDepositRefundBody: {
    type: "object",
    additionalProperties: true,
    properties: {
      clientId: positiveIntegerLikeSchema,
      client_id: positiveIntegerLikeSchema,
      paymentMethodId: positiveIntegerLikeSchema,
      payment_method_id: positiveIntegerLikeSchema,
      amountUzs: integerLikeSchema,
      amount_uzs: integerLikeSchema,
      reason: { type: "string", minLength: 1, maxLength: 255 },
      note: { type: "string", maxLength: 255 }
    },
    anyOf: [
      { required: ["clientId", "paymentMethodId", "amountUzs", "reason"] },
      { required: ["client_id", "payment_method_id", "amount_uzs", "reason"] }
    ]
  },
  discountServiceBody: {
    type: "object",
    additionalProperties: true,
    properties: {
      serviceId: positiveIntegerLikeSchema,
      service_id: positiveIntegerLikeSchema,
      limitCount: clientDiscountLimitCountSchema,
      limit_count: clientDiscountLimitCountSchema,
      isUnlimited: { type: "boolean" },
      is_unlimited: { type: "boolean" }
    },
    anyOf: [
      { required: ["serviceId"] },
      { required: ["service_id"] }
    ]
  },
  discountCreateBody: {
    type: "object",
    additionalProperties: true,
    properties: {
      clientId: positiveIntegerLikeSchema,
      client_id: positiveIntegerLikeSchema,
      discountType: { type: "string", enum: ["amount", "percent"] },
      discount_type: { type: "string", enum: ["amount", "percent"] },
      discountValue: positiveIntegerLikeSchema,
      discount_value: positiveIntegerLikeSchema,
      services: {
        type: "array",
        minItems: 1,
        maxItems: 50,
        items: {
          type: "object",
          additionalProperties: true,
          properties: {
            serviceId: positiveIntegerLikeSchema,
            service_id: positiveIntegerLikeSchema,
            limitCount: clientDiscountLimitCountSchema,
            limit_count: clientDiscountLimitCountSchema,
            isUnlimited: { type: "boolean" },
            is_unlimited: { type: "boolean" }
          },
          anyOf: [
            { required: ["serviceId"] },
            { required: ["service_id"] }
          ]
        }
      },
      note: { type: "string", maxLength: 255 }
    },
    anyOf: [
      { required: ["clientId", "discountType", "discountValue", "services"] },
      { required: ["client_id", "discount_type", "discount_value", "services"] }
    ]
  },
  discountUpdateBody: {
    type: "object",
    additionalProperties: true,
    properties: {
      isActive: { type: "boolean" },
      is_active: { type: "boolean" }
    },
    anyOf: [
      { required: ["isActive"] },
      { required: ["is_active"] }
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
