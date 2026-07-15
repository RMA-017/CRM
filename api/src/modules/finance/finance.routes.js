import { setNoCacheHeaders } from "../../lib/http.js";
import { hasPermission } from "../users/access.service.js";
import { PERMISSIONS } from "../users/users.constants.js";
import { findSettingsRequester } from "../settings/settings.service.js";
import { financeRouteSchemas } from "./finance.route-schemas.js";
import {
  exportFinanceToGoogleSheets,
  getFinanceGoogleSheetsConfig
} from "./finance-google-sheets.service.js";
import {
  closeCashSession,
  confirmCashierAppointment,
  createFinanceTicket,
  getCashierBoard,
  getCurrentCashSession,
  getFinanceActivePaymentMethods,
  getFinanceClientBalances,
  getFinanceClientDebtTickets,
  getFinanceClientTransactions,
  getFinanceDailyCash,
  getFinanceReports,
  getFinanceTicketFilterReferences,
  getFinanceTicketHistory,
  getFinanceTickets,
  getFinanceTransactions,
  markFinanceTicketUnpaid,
  payFinanceTicketsBatch,
  openCashSession,
  payFinanceTicketsFromDeposit,
  payFinanceTicket,
  refundFinanceClientDeposit,
  refundFinanceTicket,
  searchCashierClients,
  topUpFinanceClientDeposit,
  updateCashierAppointmentStatus,
  updateFinanceTicket,
  voidFinanceTransaction,
  voidFinanceTicket
} from "./finance.service.js";

const CASHIER_PERMISSIONS = Object.freeze({
  read: PERMISSIONS.FINANCE_CASHIER_READ,
  create: PERMISSIONS.FINANCE_CASHIER_CREATE,
  update: PERMISSIONS.FINANCE_CASHIER_UPDATE,
  pay: PERMISSIONS.FINANCE_CASHIER_PAY
});

const TICKETS_PERMISSIONS = Object.freeze({
  read: PERMISSIONS.FINANCE_TICKETS_READ
});

const TRANSACTIONS_PERMISSIONS = Object.freeze({
  read: PERMISSIONS.FINANCE_TRANSACTIONS_READ
});

const BALANCES_PERMISSIONS = Object.freeze({
  read: PERMISSIONS.FINANCE_BALANCES_READ,
  update: PERMISSIONS.FINANCE_BALANCES_UPDATE
});

const DAILY_CASH_PERMISSIONS = Object.freeze({
  read: PERMISSIONS.FINANCE_DAILY_CASH_READ
});

const REPORTS_PERMISSIONS = Object.freeze({
  read: PERMISSIONS.FINANCE_REPORTS_READ
});

async function requireFinanceAccess(request, reply, permissionCode) {
  const requester = await findSettingsRequester(request.authContext);
  if (!requester) {
    reply.status(401).send({ message: "Unauthorized." });
    return null;
  }

  const allowed = Boolean(requester.is_admin)
    || Boolean(requester.is_platform_admin)
    || await hasPermission(requester.role_id, permissionCode);
  if (!allowed) {
    reply.status(403).send({ message: "Forbidden." });
    return null;
  }
  return requester;
}

async function requireAnyFinanceAccess(request, reply, permissionCodes) {
  const requester = await findSettingsRequester(request.authContext);
  if (!requester) {
    reply.status(401).send({ message: "Unauthorized." });
    return null;
  }

  if (requester.is_admin || requester.is_platform_admin) {
    return requester;
  }

  for (const permissionCode of permissionCodes) {
    if (await hasPermission(requester.role_id, permissionCode)) {
      return requester;
    }
  }

  reply.status(403).send({ message: "Forbidden." });
  return null;
}

async function requireCashierAccess(request, reply, action) {
  const permissionCode = CASHIER_PERMISSIONS[action] || CASHIER_PERMISSIONS.read;
  return requireFinanceAccess(request, reply, permissionCode);
}

async function requireTicketsAccess(request, reply, action) {
  const permissionCode = TICKETS_PERMISSIONS[action] || TICKETS_PERMISSIONS.read;
  return requireFinanceAccess(request, reply, permissionCode);
}

async function requireTransactionsAccess(request, reply, action) {
  const permissionCode = TRANSACTIONS_PERMISSIONS[action] || TRANSACTIONS_PERMISSIONS.read;
  return requireFinanceAccess(request, reply, permissionCode);
}

async function requireBalancesAccess(request, reply, action) {
  const permissionCode = BALANCES_PERMISSIONS[action] || BALANCES_PERMISSIONS.read;
  return requireFinanceAccess(request, reply, permissionCode);
}

async function requireDailyCashAccess(request, reply, action) {
  const permissionCode = DAILY_CASH_PERMISSIONS[action] || DAILY_CASH_PERMISSIONS.read;
  return requireFinanceAccess(request, reply, permissionCode);
}

async function requireReportsAccess(request, reply, action) {
  const permissionCode = REPORTS_PERMISSIONS[action] || REPORTS_PERMISSIONS.read;
  return requireFinanceAccess(request, reply, permissionCode);
}

function sendRouteError(reply, error, fallbackMessage) {
  if (error?.code === "MIGRATION_REQUIRED") {
    return reply.status(409).send({
      message: error?.message || "Database migration is required.",
      code: error.code,
      details: error.details || undefined
    });
  }
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  return reply.status(statusCode).send({
    message: statusCode >= 500 ? fallbackMessage : (error?.message || fallbackMessage)
  });
}

async function financeRoutes(fastify) {
  fastify.get(
    "/payment-methods",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);
      try {
        const requester = await requireAnyFinanceAccess(request, reply, [
          PERMISSIONS.FINANCE_TRANSACTIONS_READ,
          PERMISSIONS.FINANCE_DAILY_CASH_READ,
          PERMISSIONS.FINANCE_REPORTS_READ,
          PERMISSIONS.FINANCE_BALANCES_UPDATE,
          PERMISSIONS.FINANCE_CASHIER_PAY
        ]);
        if (!requester) return null;
        const items = await getFinanceActivePaymentMethods({
          organizationId: request.authContext.organizationId
        });
        return reply.send({ items });
      } catch (error) {
        request.log.error({ err: error }, "Error fetching finance payment methods:");
        return sendRouteError(reply, error, "Failed to load payment methods.");
      }
    }
  );

  fastify.get(
    "/transactions",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        querystring: financeRouteSchemas.transactionListQuery
      }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);
      try {
        const requester = await requireTransactionsAccess(request, reply, "read");
        if (!requester) return null;
        return reply.send(await getFinanceTransactions({
          organizationId: request.authContext.organizationId,
          filters: request.query
        }));
      } catch (error) {
        request.log.error({ err: error }, "Error fetching finance transactions:");
        return sendRouteError(reply, error, "Failed to load transactions.");
      }
    }
  );

  fastify.get(
    "/transactions/clients",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        querystring: financeRouteSchemas.clientSearchQuery
      }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);
      try {
        const requester = await requireTransactionsAccess(request, reply, "read");
        if (!requester) return null;
        const items = await searchCashierClients({
          organizationId: request.authContext.organizationId,
          query: request.query?.q,
          limit: request.query?.limit
        });
        return reply.send({ items });
      } catch (error) {
        request.log.error({ err: error }, "Error searching finance transaction clients:");
        return sendRouteError(reply, error, "Failed to search clients.");
      }
    }
  );

  fastify.post(
    "/transactions/:id/void",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        params: financeRouteSchemas.idParams,
        body: financeRouteSchemas.transactionVoidBody
      }
    },
    async (request, reply) => {
      try {
        const requester = await requireCashierAccess(request, reply, "pay");
        if (!requester) return null;
        const item = await voidFinanceTransaction({
          organizationId: request.authContext.organizationId,
          id: request.params.id,
          payload: request.body,
          actorUserId: requester.id
        });
        return reply.send({ item });
      } catch (error) {
        request.log.error({ err: error }, "Error voiding finance transaction:");
        return sendRouteError(reply, error, "Transaction cancellation failed.");
      }
    }
  );

  fastify.get(
    "/daily-cash",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        querystring: financeRouteSchemas.dailyCashQuery
      }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);
      try {
        const requester = await requireDailyCashAccess(request, reply, "read");
        if (!requester) return null;
        return reply.send(await getFinanceDailyCash({
          organizationId: request.authContext.organizationId,
          filters: request.query,
          actorUserId: requester.id
        }));
      } catch (error) {
        request.log.error({ err: error }, "Error fetching finance daily cash:");
        return sendRouteError(reply, error, "Failed to load daily cash.");
      }
    }
  );

  fastify.get(
    "/reports/clients",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        querystring: financeRouteSchemas.clientSearchQuery
      }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);
      try {
        const requester = await requireReportsAccess(request, reply, "read");
        if (!requester) return null;
        const items = await searchCashierClients({
          organizationId: request.authContext.organizationId,
          query: request.query?.q,
          limit: request.query?.limit
        });
        return reply.send({ items });
      } catch (error) {
        request.log.error({ err: error }, "Error searching finance report clients:");
        return sendRouteError(reply, error, "Failed to search clients.");
      }
    }
  );

  fastify.get(
    "/reports/google-sheets/config",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        querystring: financeRouteSchemas.googleSheetsConfigQuery
      }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);
      try {
        const requester = await requireReportsAccess(request, reply, "read");
        if (!requester) return null;
        return reply.send(await getFinanceGoogleSheetsConfig({
          organizationId: request.authContext.organizationId,
          year: request.query.year
        }));
      } catch (error) {
        request.log.error({ err: error }, "Error fetching Google Sheets export config:");
        return sendRouteError(reply, error, "Failed to load Google Sheets export settings.");
      }
    }
  );

  fastify.post(
    "/reports/google-sheets/export",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        body: financeRouteSchemas.googleSheetsExportBody
      }
    },
    async (request, reply) => {
      try {
        const requester = await requireReportsAccess(request, reply, "read");
        if (!requester) return null;
        return reply.send(await exportFinanceToGoogleSheets({
          organizationId: request.authContext.organizationId,
          year: request.body.year,
          spreadsheetUrl: request.body.spreadsheetUrl,
          actorUserId: requester.id
        }));
      } catch (error) {
        request.log.error({ err: error }, "Error exporting finance data to Google Sheets:");
        return sendRouteError(reply, error, "Google Sheets export failed.");
      }
    }
  );

  fastify.get(
    "/reports",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        querystring: financeRouteSchemas.reportsQuery
      }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);
      try {
        const requester = await requireReportsAccess(request, reply, "read");
        if (!requester) return null;
        return reply.send(await getFinanceReports({
          organizationId: request.authContext.organizationId,
          filters: request.query
        }));
      } catch (error) {
        request.log.error({ err: error }, "Error fetching finance reports:");
        return sendRouteError(reply, error, "Failed to load finance reports.");
      }
    }
  );

  fastify.get(
    "/client-balances",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        querystring: financeRouteSchemas.clientBalanceListQuery
      }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);
      try {
        const requester = await requireBalancesAccess(request, reply, "read");
        if (!requester) return null;
        return reply.send(await getFinanceClientBalances({
          organizationId: request.authContext.organizationId,
          filters: request.query
        }));
      } catch (error) {
        request.log.error({ err: error }, "Error fetching finance client balances:");
        return sendRouteError(reply, error, "Failed to load client balances.");
      }
    }
  );

  fastify.get(
    "/client-balances/:id/transactions",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        params: financeRouteSchemas.idParams
      }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);
      try {
        const requester = await requireBalancesAccess(request, reply, "read");
        if (!requester) return null;
        return reply.send(await getFinanceClientTransactions({
          organizationId: request.authContext.organizationId,
          clientId: request.params.id
        }));
      } catch (error) {
        request.log.error({ err: error }, "Error fetching finance client transactions:");
        return sendRouteError(reply, error, "Failed to load client transactions.");
      }
    }
  );

  fastify.post(
    "/client-balances/deposit",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        body: financeRouteSchemas.clientDepositTopUpBody
      }
    },
    async (request, reply) => {
      try {
        const requester = await requireCashierAccess(request, reply, "pay");
        if (!requester) return null;
        return reply.status(201).send(await topUpFinanceClientDeposit({
          organizationId: request.authContext.organizationId,
          payload: request.body,
          actorUserId: requester.id
        }));
      } catch (error) {
        request.log.error({ err: error }, "Error topping up finance client deposit:");
        return sendRouteError(reply, error, "Deposit transaction failed.");
      }
    }
  );

  fastify.post(
    "/client-balances/refund",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        body: financeRouteSchemas.clientDepositRefundBody
      }
    },
    async (request, reply) => {
      try {
        const requester = await requireCashierAccess(request, reply, "pay");
        if (!requester) return null;
        return reply.status(201).send(await refundFinanceClientDeposit({
          organizationId: request.authContext.organizationId,
          payload: request.body,
          actorUserId: requester.id
        }));
      } catch (error) {
        request.log.error({ err: error }, "Error refunding finance client deposit:");
        return sendRouteError(reply, error, "Deposit transaction failed.");
      }
    }
  );

  fastify.get(
    "/client-balances/:id/debt-tickets",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        params: financeRouteSchemas.idParams
      }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);
      try {
        const requester = await requireBalancesAccess(request, reply, "read");
        if (!requester) return null;
        return reply.send(await getFinanceClientDebtTickets({
          organizationId: request.authContext.organizationId,
          clientId: request.params.id
        }));
      } catch (error) {
        request.log.error({ err: error }, "Error fetching finance client debt tickets:");
        return sendRouteError(reply, error, "Failed to load client debt tickets.");
      }
    }
  );

  fastify.post(
    "/client-balances/pay-from-deposit",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        body: financeRouteSchemas.clientDepositTicketPaymentBody
      }
    },
    async (request, reply) => {
      try {
        const requester = await requireCashierAccess(request, reply, "pay");
        if (!requester) return null;
        return reply.send(await payFinanceTicketsFromDeposit({
          organizationId: request.authContext.organizationId,
          payload: request.body,
          actorUserId: requester.id
        }));
      } catch (error) {
        request.log.error({ err: error }, "Error paying finance tickets from deposit:");
        return sendRouteError(reply, error, "Deposit ticket payment failed.");
      }
    }
  );

  fastify.get(
    "/tickets",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        querystring: financeRouteSchemas.ticketListQuery
      }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);
      try {
        const requester = await requireTicketsAccess(request, reply, "read");
        if (!requester) return null;
        return reply.send(await getFinanceTickets({
          organizationId: request.authContext.organizationId,
          filters: request.query
        }));
      } catch (error) {
        request.log.error({ err: error }, "Error fetching finance tickets:");
        return sendRouteError(reply, error, "Failed to load tickets.");
      }
    }
  );

  fastify.get(
    "/tickets/references",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);
      try {
        const requester = await requireAnyFinanceAccess(request, reply, [
          PERMISSIONS.FINANCE_TICKETS_READ,
          PERMISSIONS.FINANCE_REPORTS_READ
        ]);
        if (!requester) return null;
        return reply.send(await getFinanceTicketFilterReferences({
          organizationId: request.authContext.organizationId
        }));
      } catch (error) {
        request.log.error({ err: error }, "Error fetching finance ticket filter references:");
        return sendRouteError(reply, error, "Failed to load ticket references.");
      }
    }
  );

  fastify.get(
    "/tickets/clients",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        querystring: financeRouteSchemas.clientSearchQuery
      }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);
      try {
        const requester = await requireTicketsAccess(request, reply, "read");
        if (!requester) return null;
        const items = await searchCashierClients({
          organizationId: request.authContext.organizationId,
          query: request.query?.q,
          limit: request.query?.limit
        });
        return reply.send({ items });
      } catch (error) {
        request.log.error({ err: error }, "Error searching finance ticket clients:");
        return sendRouteError(reply, error, "Failed to search clients.");
      }
    }
  );

  fastify.get(
    "/cashier/session/current",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);
      try {
        const requester = await requireCashierAccess(request, reply, "read");
        if (!requester) return null;
        const item = await getCurrentCashSession({
          organizationId: request.authContext.organizationId,
          actorUserId: requester.id
        });
        return reply.send({ item });
      } catch (error) {
        request.log.error({ err: error }, "Error fetching current finance cash session:");
        return sendRouteError(reply, error, "Failed to load cash session.");
      }
    }
  );

  fastify.post(
    "/cashier/session/open",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        body: financeRouteSchemas.cashSessionOpenBody
      }
    },
    async (request, reply) => {
      try {
        const requester = await requireCashierAccess(request, reply, "pay");
        if (!requester) return null;
        const item = await openCashSession({
          organizationId: request.authContext.organizationId,
          payload: request.body,
          actorUserId: requester.id
        });
        return reply.status(201).send({ item });
      } catch (error) {
        request.log.error({ err: error }, "Error opening finance cash session:");
        return sendRouteError(reply, error, "Cash session open failed.");
      }
    }
  );

  fastify.post(
    "/cashier/session/close",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        body: financeRouteSchemas.cashSessionCloseBody
      }
    },
    async (request, reply) => {
      try {
        const requester = await requireCashierAccess(request, reply, "pay");
        if (!requester) return null;
        const item = await closeCashSession({
          organizationId: request.authContext.organizationId,
          payload: request.body,
          actorUserId: requester.id
        });
        return reply.send({ item });
      } catch (error) {
        request.log.error({ err: error }, "Error closing finance cash session:");
        return sendRouteError(reply, error, "Cash session close failed.");
      }
    }
  );

  fastify.get(
    "/tickets/:id/history",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        params: financeRouteSchemas.idParams
      }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);
      try {
        const requester = await requireTicketsAccess(request, reply, "read");
        if (!requester) return null;
        const items = await getFinanceTicketHistory({
          organizationId: request.authContext.organizationId,
          id: request.params.id
        });
        return reply.send({ items });
      } catch (error) {
        request.log.error({ err: error }, "Error fetching finance ticket history:");
        return sendRouteError(reply, error, "Failed to load ticket history.");
      }
    }
  );

  fastify.get(
    "/cashier/clients",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        querystring: financeRouteSchemas.clientSearchQuery
      }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);
      try {
        const requester = await requireCashierAccess(request, reply, "read");
        if (!requester) return null;
        const items = await searchCashierClients({
          organizationId: request.authContext.organizationId,
          query: request.query?.q,
          limit: request.query?.limit
        });
        return reply.send({ items });
      } catch (error) {
        request.log.error({ err: error }, "Error searching finance cashier clients:");
        return sendRouteError(reply, error, "Failed to search clients.");
      }
    }
  );

  fastify.get(
    "/cashier/board",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        querystring: financeRouteSchemas.boardQuery
      }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);
      try {
        const requester = await requireCashierAccess(request, reply, "read");
        if (!requester) return null;
        return reply.send(await getCashierBoard({
          organizationId: request.authContext.organizationId,
          dateFrom: request.query?.dateFrom ?? request.query?.date_from,
          dateTo: request.query?.dateTo ?? request.query?.date_to,
          query: request.query?.q ?? request.query?.query ?? request.query?.search,
          limit: request.query?.limit
        }));
      } catch (error) {
        request.log.error({ err: error }, "Error fetching finance cashier board:");
        return sendRouteError(reply, error, "Failed to load cashier board.");
      }
    }
  );

  fastify.post(
    "/cashier/appointments/:id/confirm",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        params: financeRouteSchemas.idParams
      }
    },
    async (request, reply) => {
      try {
        const requester = await requireCashierAccess(request, reply, "update");
        if (!requester) return null;
        const item = await confirmCashierAppointment({
          organizationId: request.authContext.organizationId,
          id: request.params.id,
          actorUserId: requester.id
        });
        return reply.send({ item });
      } catch (error) {
        request.log.error({ err: error }, "Error confirming finance cashier appointment:");
        return sendRouteError(reply, error, "Appointment update failed.");
      }
    }
  );

  fastify.post(
    "/cashier/appointments/:id/status",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        params: financeRouteSchemas.idParams,
        body: financeRouteSchemas.cashierAppointmentStatusBody
      }
    },
    async (request, reply) => {
      try {
        const requester = await requireCashierAccess(request, reply, "update");
        if (!requester) return null;
        const item = await updateCashierAppointmentStatus({
          organizationId: request.authContext.organizationId,
          id: request.params.id,
          status: request.body?.status,
          actorUserId: requester.id
        });
        return reply.send({ item });
      } catch (error) {
        request.log.error({ err: error }, "Error updating finance cashier appointment status:");
        return sendRouteError(reply, error, "Appointment update failed.");
      }
    }
  );

  fastify.post(
    "/cashier/tickets",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        body: financeRouteSchemas.ticketCreateBody
      }
    },
    async (request, reply) => {
      try {
        const requester = await requireCashierAccess(request, reply, "create");
        if (!requester) return null;
        const ticket = await createFinanceTicket({
          organizationId: request.authContext.organizationId,
          payload: request.body,
          actorUserId: requester.id
        });
        return reply.status(201).send({ item: ticket });
      } catch (error) {
        request.log.error({ err: error }, "Error creating finance ticket:");
        return sendRouteError(reply, error, "Ticket create failed.");
      }
    }
  );

  fastify.patch(
    "/cashier/tickets/:id",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        params: financeRouteSchemas.idParams,
        body: financeRouteSchemas.ticketUpdateBody
      }
    },
    async (request, reply) => {
      try {
        const requester = await requireCashierAccess(request, reply, "update");
        if (!requester) return null;
        const ticket = await updateFinanceTicket({
          organizationId: request.authContext.organizationId,
          id: request.params.id,
          payload: request.body,
          actorUserId: requester.id
        });
        return reply.send({ item: ticket });
      } catch (error) {
        request.log.error({ err: error }, "Error updating finance ticket:");
        return sendRouteError(reply, error, "Ticket update failed.");
      }
    }
  );

  fastify.post(
    "/cashier/tickets/pay-batch",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        body: financeRouteSchemas.ticketBatchPaymentBody
      }
    },
    async (request, reply) => {
      try {
        const requester = await requireCashierAccess(request, reply, "pay");
        if (!requester) return null;
        return reply.send(await payFinanceTicketsBatch({
          organizationId: request.authContext.organizationId,
          payload: request.body,
          actorUserId: requester.id
        }));
      } catch (error) {
        request.log.error({ err: error }, "Error paying finance tickets batch:");
        return sendRouteError(reply, error, "Ticket payment failed.");
      }
    }
  );

  fastify.post(
    "/cashier/tickets/:id/pay",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        params: financeRouteSchemas.idParams,
        body: financeRouteSchemas.ticketPaymentBody
      }
    },
    async (request, reply) => {
      try {
        const requester = await requireCashierAccess(request, reply, "pay");
        if (!requester) return null;
        const ticket = await payFinanceTicket({
          organizationId: request.authContext.organizationId,
          id: request.params.id,
          payload: request.body,
          actorUserId: requester.id
        });
        return reply.send({ item: ticket });
      } catch (error) {
        request.log.error({ err: error }, "Error paying finance ticket:");
        return sendRouteError(reply, error, "Ticket payment failed.");
      }
    }
  );

  fastify.post(
    "/cashier/tickets/:id/refund",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        params: financeRouteSchemas.idParams,
        body: financeRouteSchemas.ticketRefundBody
      }
    },
    async (request, reply) => {
      try {
        const requester = await requireCashierAccess(request, reply, "pay");
        if (!requester) return null;
        const ticket = await refundFinanceTicket({
          organizationId: request.authContext.organizationId,
          id: request.params.id,
          payload: request.body,
          actorUserId: requester.id
        });
        return reply.send({ item: ticket });
      } catch (error) {
        request.log.error({ err: error }, "Error refunding finance ticket:");
        return sendRouteError(reply, error, "Ticket refund failed.");
      }
    }
  );

  fastify.post(
    "/cashier/tickets/:id/unpaid",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        params: financeRouteSchemas.idParams
      }
    },
    async (request, reply) => {
      try {
        const requester = await requireCashierAccess(request, reply, "update");
        if (!requester) return null;
        const ticket = await markFinanceTicketUnpaid({
          organizationId: request.authContext.organizationId,
          id: request.params.id,
          actorUserId: requester.id
        });
        return reply.send({ item: ticket });
      } catch (error) {
        request.log.error({ err: error }, "Error marking finance ticket unpaid:");
        return sendRouteError(reply, error, "Ticket update failed.");
      }
    }
  );

  fastify.post(
    "/cashier/tickets/:id/void",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        params: financeRouteSchemas.idParams,
        body: financeRouteSchemas.ticketVoidBody
      }
    },
    async (request, reply) => {
      try {
        const requester = await requireCashierAccess(request, reply, "update");
        if (!requester) return null;
        const ticket = await voidFinanceTicket({
          organizationId: request.authContext.organizationId,
          id: request.params.id,
          payload: request.body,
          actorUserId: requester.id
        });
        return reply.send({ item: ticket });
      } catch (error) {
        request.log.error({ err: error }, "Error voiding finance ticket:");
        return sendRouteError(reply, error, "Ticket update failed.");
      }
    }
  );
}

export const __financeRouteContracts = Object.freeze({
  financeRouteSchemas
});

export default financeRoutes;
