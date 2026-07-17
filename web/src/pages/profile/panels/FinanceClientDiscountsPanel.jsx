import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import CustomSelect from "../../../components/CustomSelect.jsx";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";
import { formatDateTimeTashkent } from "../../../lib/formatters.js";
import { useEscapeKey } from "../../../lib/use-escape-key.js";
import { useI18n } from "../../../i18n/I18nProvider.jsx";

const EMPTY_CREATE_FORM = Object.freeze({
  discountType: "amount",
  discountValue: "",
  note: ""
});

const DISCOUNT_TYPE_OPTIONS = Object.freeze([
  { value: "amount", label: "Сумма" },
  { value: "percent", label: "Процент" }
]);

const DISCOUNT_MAX_LIMIT_COUNT = 22;
const DISCOUNT_UNLIMITED_VALUE = "unlimited";
const DISCOUNT_LIMIT_OPTIONS = Object.freeze([
  ...Array.from({ length: DISCOUNT_MAX_LIMIT_COUNT }, (_, index) => {
    const value = String(index + 1);
    return { value, label: value };
  }),
  { value: DISCOUNT_UNLIMITED_VALUE, label: "23 - Безлимит" }
]);

const STATUS_LABELS = Object.freeze({
  active: "Активна",
  completed: "Завершена",
  unlimited: "Безлимит",
  disabled: "Отключена"
});

function toIntegerAmount(value) {
  return Number.parseInt(String(value ?? 0), 10) || 0;
}

function formatMoney(value) {
  const amount = toIntegerAmount(value);
  return amount.toLocaleString("ru-RU");
}

function formatDiscount(item) {
  const value = toIntegerAmount(item?.discountValue ?? item?.discount_value);
  return String(item?.discountType || item?.discount_type) === "percent"
    ? `${value}%`
    : `${formatMoney(value)} сум`;
}

function getStatusClassName(status) {
  const normalized = String(status || "active").toLowerCase();
  if (normalized === "completed") return "is-completed";
  if (normalized === "disabled") return "is-disabled";
  if (normalized === "unlimited") return "is-unlimited";
  return "is-active";
}

function formatServiceProgress(service) {
  if (service?.limitCount === null || service?.limit_count === null) {
    return "безлимит";
  }
  const usedCount = toIntegerAmount(service?.usedCount ?? service?.used_count);
  const limitCount = toIntegerAmount(service?.limitCount ?? service?.limit_count);
  return `${usedCount}/${limitCount}`;
}

function getServiceSummary(item) {
  const services = Array.isArray(item?.services) ? item.services : [];
  if (services.length === 0) return "-";
  const visible = services.slice(0, 3).map((service) => {
    const name = String(service?.serviceName || service?.service_name || "").trim() || "-";
    return `${name} (${formatServiceProgress(service)})`;
  });
  if (services.length > visible.length) {
    visible.push(`+${services.length - visible.length}`);
  }
  return visible.join(", ");
}

function normalizeClientLabel(client) {
  const name = String(client?.fullName || client?.full_name || client?.clientName || "").trim();
  const phone = String(client?.phone || client?.phone_number || "").trim();
  return [name, phone].filter(Boolean).join(" · ") || (client?.id ? `ID ${client.id}` : "");
}

function createDiscountServiceRow() {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    serviceId: "",
    serviceName: "",
    limitCount: "1",
    isUnlimited: false
  };
}

function FinanceClientDiscountsPanel({
  onClose,
  canCreateFinanceDiscounts = false,
  canUpdateFinanceDiscounts = false
}) {
  const { translate } = useI18n();
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [services, setServices] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [clientSearch, setClientSearch] = useState("");
  const [clientOptions, setClientOptions] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [serviceRows, setServiceRows] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const discountServiceOptions = useMemo(() => services.filter(Boolean).map((service) => ({
    value: String(service.id),
    label: String(service.name || service.id),
    item: service
  })), [services]);

  const loadDiscounts = useCallback(async (nextPage = 1, nextQuery = "") => {
    try {
      setLoading(true);
      setMessage("");
      const params = new URLSearchParams();
      params.set("page", String(nextPage));
      params.set("pageSize", "20");
      if (String(nextQuery || "").trim()) {
        params.set("q", String(nextQuery || "").trim());
      }
      const response = await apiFetch(`/api/finance/discounts?${params.toString()}`);
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setItems([]);
        return;
      }
      setItems(Array.isArray(data?.items) ? data.items : []);
      setPage(toIntegerAmount(data?.page) || 1);
      setTotalPages(Math.max(1, toIntegerAmount(data?.totalPages) || 1));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReferences = useCallback(async () => {
    try {
      const response = await apiFetch("/api/finance/discounts/references");
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setServices([]);
        return;
      }
      setServices(Array.isArray(data?.services) ? data.services : []);
    } catch {
      setServices([]);
    }
  }, []);

  useEffect(() => {
    void loadDiscounts(1, "");
    void loadReferences();
  }, [loadDiscounts, loadReferences]);

  useEffect(() => {
    const normalizedSearch = String(clientSearch || "").trim();
    if (!createOpen || (!/^\d+$/.test(normalizedSearch) && normalizedSearch.length < 3)) {
      setClientOptions([]);
      return undefined;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const response = await apiFetch(`/api/finance/discounts/clients?q=${encodeURIComponent(normalizedSearch)}&limit=30`);
        const data = await readApiResponseData(response);
        if (!active) return;
        setClientOptions(response.ok && Array.isArray(data?.items) ? data.items : []);
      } catch {
        if (active) setClientOptions([]);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [clientSearch, createOpen]);

  const closeCreateModal = useCallback(() => {
    setCreateOpen(false);
    setCreateForm(EMPTY_CREATE_FORM);
    setClientSearch("");
    setClientOptions([]);
    setSelectedClient(null);
    setServiceRows([]);
    setSubmitting(false);
    setCreateError("");
  }, []);

  const closeDetailModal = useCallback(() => {
    setDetail(null);
    setDetailLoading(false);
  }, []);

  useEscapeKey(createOpen, closeCreateModal);
  useEscapeKey(Boolean(detail), closeDetailModal);

  const openCreateModal = useCallback(() => {
    setCreateOpen(true);
    setServiceRows((current) => (current.length > 0 ? current : [createDiscountServiceRow()]));
    if (services.length === 0) {
      void loadReferences();
    }
  }, [loadReferences, services.length]);

  const updateCreateForm = useCallback((field, value) => {
    setCreateError("");
    setCreateForm((current) => ({
      ...current,
      [field]: value
    }));
  }, []);

  const updateServiceRow = useCallback((key, patch) => {
    setCreateError("");
    setServiceRows((current) => {
      const normalizedKey = String(key || "");
      return current.map((row) => (
        String(row.key || "") === normalizedKey ? { ...row, ...patch } : row
      ));
    });
  }, []);

  const addServiceRow = useCallback(() => {
    setCreateError("");
    setServiceRows((current) => [...current, createDiscountServiceRow()]);
  }, []);

  const removeServiceRow = useCallback((key) => {
    setCreateError("");
    setServiceRows((current) => {
      if (current.length <= 1) {
        return current;
      }
      const normalizedKey = String(key || "");
      return current.filter((row) => String(row.key || "") !== normalizedKey);
    });
  }, []);

  const submitCreate = useCallback(async (event) => {
    event.preventDefault();
    if (!selectedClient?.id) {
      setCreateError("Выберите клиента.");
      return;
    }
    const discountValue = toIntegerAmount(createForm.discountValue);
    if (discountValue <= 0) {
      setCreateError("Укажите скидку.");
      return;
    }
    if (createForm.discountType === "percent" && discountValue > 100) {
      setCreateError("Процент скидки не может быть больше 100.");
      return;
    }
    const selectedServiceRows = serviceRows.filter((row) => String(row.serviceId || "").trim());
    if (selectedServiceRows.length === 0) {
      setCreateError("Выберите услуги.");
      return;
    }
    const selectedServiceIdSet = new Set();
    const hasDuplicateService = selectedServiceRows.some((row) => {
      const serviceId = String(row.serviceId || "").trim();
      if (selectedServiceIdSet.has(serviceId)) {
        return true;
      }
      selectedServiceIdSet.add(serviceId);
      return false;
    });
    if (hasDuplicateService) {
      setCreateError("Одна услуга выбрана несколько раз.");
      return;
    }
    const invalidLimit = selectedServiceRows.some((row) => {
      if (row.isUnlimited) return false;
      const limitCount = toIntegerAmount(row.limitCount);
      return limitCount <= 0 || limitCount > DISCOUNT_MAX_LIMIT_COUNT;
    });
    if (invalidLimit) {
      setCreateError("Количество должно быть от 1 до 22 или Безлимит.");
      return;
    }

    try {
      setSubmitting(true);
      setMessage("");
      setCreateError("");
      const response = await apiFetch("/api/finance/discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClient.id,
          discountType: createForm.discountType,
          discountValue,
          note: createForm.note,
          services: selectedServiceRows.map((row) => ({
            serviceId: row.serviceId,
            isUnlimited: Boolean(row.isUnlimited),
            limitCount: row.isUnlimited ? null : toIntegerAmount(row.limitCount)
          }))
        })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setCreateError(data?.message || "Не удалось создать скидку.");
        return;
      }
      closeCreateModal();
      await loadDiscounts(1);
    } catch {
      setCreateError("Не удалось создать скидку.");
    } finally {
      setSubmitting(false);
    }
  }, [closeCreateModal, createForm.discountType, createForm.discountValue, createForm.note, loadDiscounts, selectedClient, serviceRows]);

  const openDetail = useCallback(async (item) => {
    const id = item?.id;
    if (!id) return;
    try {
      setDetailLoading(true);
      setDetail({ item, usages: [] });
      const response = await apiFetch(`/api/finance/discounts/${encodeURIComponent(id)}`);
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setMessage(data?.message || "Не удалось загрузить скидку.");
        setDetail(null);
        return;
      }
      setDetail(data);
    } catch {
      setMessage("Не удалось загрузить скидку.");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const toggleRuleActive = useCallback(async (item) => {
    if (!canUpdateFinanceDiscounts || !item?.id) return;
    try {
      const response = await apiFetch(`/api/finance/discounts/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !item.isActive })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setMessage(data?.message || "Не удалось обновить скидку.");
        return;
      }
      await loadDiscounts(page);
    } catch {
      setMessage("Не удалось обновить скидку.");
    }
  }, [canUpdateFinanceDiscounts, loadDiscounts, page]);

  const modalRoot = typeof document !== "undefined" ? document.body : null;
  const detailItem = detail?.item || null;
  const detailServices = Array.isArray(detailItem?.services) ? detailItem.services : [];
  const detailUsages = Array.isArray(detail?.usages) ? detail.usages : [];

  return (
    <section id="financeClientDiscountsPanel" className="all-users-panel settings-panel ops-panel-shell finance-panel-shell finance-discounts-panel">
      <div className="all-users-head finance-discounts-head">
        <h3>Скидки клиентов</h3>
        <div className="all-users-head-actions">
          <button
            type="button"
            className="header-btn appointment-breaks-add-icon-btn"
            onClick={openCreateModal}
            disabled={!canCreateFinanceDiscounts}
            title="Создать скидку"
            aria-label="Создать скидку"
          >
            +
          </button>
          <button
            type="button"
            className="header-btn panel-close-btn"
            onClick={onClose}
            aria-label={translate("Close finance reports panel")}
          >
            ×
          </button>
        </div>
      </div>

      {message ? <p className="all-users-state">{message}</p> : null}

      <div className="all-users-table-scroll">
        <table className="all-users-table finance-discounts-table" aria-label="Client discounts">
          <colgroup>
            <col className="finance-discounts-col-client" />
            <col className="finance-discounts-col-services" />
            <col className="finance-discounts-col-discount" />
            <col className="finance-discounts-col-remaining" />
            <col className="finance-discounts-col-status" />
            <col className="finance-discounts-col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th>Клиент</th>
              <th>Услуги</th>
              <th>Скидка</th>
              <th>Осталось</th>
              <th>Статус</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="all-users-state">Загрузка...</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="all-users-state">Скидок нет.</td>
              </tr>
            ) : items.map((item) => (
              <tr
                key={item.id}
                className="finance-discounts-row"
                onDoubleClick={() => openDetail(item)}
              >
                <td className="finance-discounts-cell-client">{item.clientName || "-"}</td>
                <td className="finance-discounts-cell-services">{getServiceSummary(item)}</td>
                <td className="finance-discounts-cell-money">{formatDiscount(item)}</td>
                <td className="finance-discounts-cell-remaining">{item.remainingCount === null ? "безлимит" : toIntegerAmount(item.remainingCount)}</td>
                <td>
                  <span className={`finance-discount-status ${getStatusClassName(item.status)}`}>
                    {STATUS_LABELS[item.status] || item.status}
                  </span>
                </td>
                <td>
                  <div className="finance-discount-actions">
                    <button type="button" className="table-action-btn" onClick={() => openDetail(item)}>Детали</button>
                    <button
                      type="button"
                      className="table-action-btn"
                      onClick={() => toggleRuleActive(item)}
                      disabled={!canUpdateFinanceDiscounts}
                    >
                      {item.isActive ? "Откл." : "Вкл."}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="table-pagination">
        <button type="button" disabled={page <= 1 || loading} onClick={() => loadDiscounts(page - 1)}>
          Prev
        </button>
        <span>{page} / {totalPages}</span>
        <button type="button" disabled={page >= totalPages || loading} onClick={() => loadDiscounts(page + 1)}>
          Next
        </button>
      </div>

      {createOpen && modalRoot ? createPortal(
        <div className="finance-modal-overlay" role="presentation">
          <div id="financeClientDiscountCreateModal" className="logout-confirm-modal all-users-edit-modal finance-modal finance-discounts-modal">
            <form className="auth-form finance-discounts-create-form" onSubmit={submitCreate}>
              <div className="finance-discounts-create-head">
                <h3>Новая скидка клиента</h3>
                <button
                  type="button"
                  className="header-btn panel-close-btn"
                  onClick={closeCreateModal}
                  disabled={submitting}
                  aria-label="Закрыть"
                >
                  ×
                </button>
              </div>

              <div className="finance-discounts-create-body">
                <div className="finance-discounts-simple-form">
                  <div className="field finance-discounts-client-field">
                    <input
                      type="search"
                      value={selectedClient ? normalizeClientLabel(selectedClient) : clientSearch}
                      placeholder="Клиент"
                      onChange={(event) => {
                        setCreateError("");
                        setSelectedClient(null);
                        setClientSearch(event.currentTarget.value);
                      }}
                    />
                    {!selectedClient && clientOptions.length > 0 ? (
                      <div className="finance-discounts-client-results">
                        {clientOptions.map((client) => (
                          <button
                            key={client.id}
                            type="button"
                            onClick={() => {
                              setSelectedClient(client);
                              setCreateError("");
                              setClientSearch(normalizeClientLabel(client));
                              setClientOptions([]);
                            }}
                          >
                            {normalizeClientLabel(client)}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="finance-discounts-discount-row">
                    <div className="field">
                      <CustomSelect
                        value={createForm.discountType}
                        options={DISCOUNT_TYPE_OPTIONS}
                        onChange={(value) => updateCreateForm("discountType", value)}
                        placeholder="Тип скидки"
                        menuPortal
                      />
                    </div>

                    <div className="field">
                      <input
                        type="number"
                        min="1"
                        max={createForm.discountType === "percent" ? "100" : undefined}
                        placeholder={createForm.discountType === "percent" ? "Процент" : "Сумма"}
                        value={createForm.discountValue}
                        onChange={(event) => updateCreateForm("discountValue", event.currentTarget.value)}
                      />
                    </div>
                  </div>

                  {createError ? <p className="all-users-state finance-discounts-modal-error">{createError}</p> : null}

                  <div className="finance-discounts-service-lines">
                    {serviceRows.map((row) => (
                      <div className="finance-discounts-service-line" key={row.key}>
                        <label className="field finance-discounts-service-select-field">
                          <CustomSelect
                            value={row.serviceId}
                            options={discountServiceOptions}
                            placeholder="Выберите услугу"
                            searchable
                            searchThreshold={1}
                            menuPortal
                            emptyText="Услуги не найдены."
                            onChange={(value) => {
                              const service = services.find((entry) => String(entry.id) === String(value || ""));
                              updateServiceRow(row.key, {
                                serviceId: value,
                                serviceName: service?.name || ""
                              });
                            }}
                          />
                        </label>
                        <label className="field finance-discounts-service-count-field">
                          <CustomSelect
                            value={row.isUnlimited ? DISCOUNT_UNLIMITED_VALUE : String(row.limitCount || "1")}
                            options={DISCOUNT_LIMIT_OPTIONS}
                            placeholder="Кол-во"
                            menuPortal
                            onChange={(value) => {
                              if (value === DISCOUNT_UNLIMITED_VALUE) {
                                updateServiceRow(row.key, { isUnlimited: true, limitCount: "23" });
                                return;
                              }
                              updateServiceRow(row.key, { isUnlimited: false, limitCount: value });
                            }}
                          />
                        </label>
                        <div className="finance-discounts-service-actions">
                          <button
                            type="button"
                            className="table-action-btn finance-manual-icon-btn finance-manual-add-btn"
                            aria-label="Добавить услугу"
                            title="Добавить услугу"
                            onClick={addServiceRow}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="table-action-btn finance-manual-icon-btn"
                            aria-label="Удалить услугу"
                            title="Удалить услугу"
                            disabled={serviceRows.length <= 1}
                            onClick={() => removeServiceRow(row.key)}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="field finance-discounts-note-field">
                    <input
                      type="text"
                      maxLength={255}
                      placeholder="Примечание"
                      value={createForm.note}
                      onChange={(event) => updateCreateForm("note", event.currentTarget.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="all-users-edit-actions finance-discounts-modal-actions">
                <button type="submit" className="btn" disabled={submitting}>
                  {submitting ? "Сохранение..." : "Создать"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        modalRoot
      ) : null}

      {detail && modalRoot ? createPortal(
        <div className="finance-modal-overlay" role="presentation">
          <div id="financeClientDiscountDetailModal" className="logout-confirm-modal all-users-edit-modal finance-modal finance-discounts-detail-modal">
            <div className="finance-discounts-detail-head">
              <div>
                <h3>Скидка #{detailItem?.id}</h3>
                <p>{detailItem?.clientName || "-"}</p>
              </div>
              <button type="button" className="all-users-close" onClick={closeDetailModal}>x</button>
            </div>
            {detailLoading ? <p className="all-users-state">Загрузка...</p> : null}
            <div className="finance-ticket-summary finance-discounts-detail-summary">
              <div>
                <span>Скидка</span>
                <strong>{formatDiscount(detailItem)}</strong>
              </div>
              <div>
                <span>Использовано</span>
                <strong>{toIntegerAmount(detailItem?.usedCount)}</strong>
              </div>
              <div>
                <span>Осталось</span>
                <strong>{detailItem?.remainingCount === null ? "безлимит" : toIntegerAmount(detailItem?.remainingCount)}</strong>
              </div>
            </div>
            <div className="finance-discounts-detail-grid">
              <div>
                <h4>Услуги</h4>
                <div className="finance-discounts-detail-services">
                  {detailServices.map((service) => (
                    <div key={service.id} className="finance-discounts-detail-service">
                      <strong>{service.serviceName}</strong>
                      <span>{formatServiceProgress(service)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4>История использования</h4>
                <div className="all-users-table-scroll finance-discounts-usage-scroll">
                  <table className="all-users-table finance-discounts-usage-table">
                    <thead>
                      <tr>
                        <th>Дата</th>
                        <th>Талон</th>
                        <th>Услуга</th>
                        <th>Скидка</th>
                        <th>Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailUsages.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="all-users-state">Использований нет.</td>
                        </tr>
                      ) : detailUsages.map((usage) => (
                        <tr key={usage.id}>
                          <td>{formatDateTimeTashkent(usage.createdAt || usage.created_at)}</td>
                          <td>{usage.ticketNumber ? `#${usage.ticketNumber}` : "-"}</td>
                          <td>{usage.serviceName || "-"}</td>
                          <td>{formatMoney(usage.discountUzs)} сум</td>
                          <td>{usage.isReversed ? "Отменено" : "Активно"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>,
        modalRoot
      ) : null}
    </section>
  );
}

export default FinanceClientDiscountsPanel;
