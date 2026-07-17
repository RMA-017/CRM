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

  const selectedServiceIds = useMemo(() => (
    new Set(serviceRows.map((row) => String(row.serviceId)))
  ), [serviceRows]);

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

  const toggleService = useCallback((service) => {
    const serviceId = String(service?.id || "");
    if (!serviceId) return;
    setCreateError("");
    setServiceRows((current) => {
      if (current.some((row) => String(row.serviceId) === serviceId)) {
        return current.filter((row) => String(row.serviceId) !== serviceId);
      }
      return [
        ...current,
        {
          serviceId,
          serviceName: service.name || "",
          limitCount: "1",
          isUnlimited: false
        }
      ];
    });
  }, []);

  const updateServiceRow = useCallback((serviceId, patch) => {
    setCreateError("");
    setServiceRows((current) => current.map((row) => (
      String(row.serviceId) === String(serviceId)
        ? { ...row, ...patch }
        : row
    )));
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
    if (serviceRows.length === 0) {
      setCreateError("Выберите услуги.");
      return;
    }
    const invalidLimit = serviceRows.some((row) => !row.isUnlimited && toIntegerAmount(row.limitCount) <= 0);
    if (invalidLimit) {
      setCreateError("Укажите количество для выбранных услуг.");
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
          services: serviceRows.map((row) => ({
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
          <thead>
            <tr>
              <th>ID</th>
              <th>Клиент</th>
              <th>Услуги</th>
              <th>Скидка</th>
              <th>Использовано</th>
              <th>Осталось</th>
              <th>Статус</th>
              <th>Примечание</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="all-users-state">Загрузка...</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={9} className="all-users-state">Скидок нет.</td>
              </tr>
            ) : items.map((item) => (
              <tr
                key={item.id}
                className="finance-discounts-row"
                onDoubleClick={() => openDetail(item)}
              >
                <td>#{item.id}</td>
                <td>{item.clientName || "-"}</td>
                <td>{getServiceSummary(item)}</td>
                <td>{formatDiscount(item)}</td>
                <td>{toIntegerAmount(item.usedCount)}</td>
                <td>{item.remainingCount === null ? "безлимит" : toIntegerAmount(item.remainingCount)}</td>
                <td>
                  <span className={`finance-discount-status ${getStatusClassName(item.status)}`}>
                    {STATUS_LABELS[item.status] || item.status}
                  </span>
                </td>
                <td>{item.note || "-"}</td>
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
                <section className="finance-discounts-create-section">
                  <div className="finance-discounts-section-title">
                    <strong>Клиент и скидка</strong>
                  </div>
                  <div className="all-users-edit-fields finance-discounts-form-grid">
                    <div className="field finance-discounts-client-field">
                      <span>Клиент</span>
                      <input
                        type="search"
                        value={selectedClient ? normalizeClientLabel(selectedClient) : clientSearch}
                        placeholder="Введите имя, телефон или ID"
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

                    <div className="field">
                      <span>Тип скидки</span>
                      <CustomSelect
                        value={createForm.discountType}
                        options={DISCOUNT_TYPE_OPTIONS}
                        onChange={(value) => updateCreateForm("discountType", value)}
                        placeholder="Тип скидки"
                        menuPortal
                      />
                    </div>

                    <div className="field">
                      <span>{createForm.discountType === "percent" ? "Процент" : "Сумма"}</span>
                      <input
                        type="number"
                        min="1"
                        max={createForm.discountType === "percent" ? "100" : undefined}
                        value={createForm.discountValue}
                        onChange={(event) => updateCreateForm("discountValue", event.currentTarget.value)}
                      />
                    </div>

                    <div className="field finance-discounts-note-field">
                      <span>Примечание</span>
                      <input
                        type="text"
                        maxLength={255}
                        value={createForm.note}
                        onChange={(event) => updateCreateForm("note", event.currentTarget.value)}
                      />
                    </div>
                  </div>
                </section>

                {createError ? <p className="all-users-state finance-discounts-modal-error">{createError}</p> : null}

                <section className="finance-discounts-create-section finance-discounts-services">
                  <div className="finance-discounts-services-head">
                    <strong>Услуги</strong>
                    <span>{serviceRows.length} выбрано</span>
                  </div>
                  <div className="finance-discounts-service-list">
                    {services.map((service) => {
                      const checked = selectedServiceIds.has(String(service.id));
                      const selectedRow = serviceRows.find((row) => String(row.serviceId) === String(service.id));
                      return (
                        <div key={service.id} className={`finance-discounts-service-row${checked ? " is-selected" : ""}`}>
                          <label className="settings-checkbox settings-checkbox-inline">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleService(service)}
                            />
                            <span>{service.name}</span>
                          </label>
                          {checked ? (
                            <div className="finance-discounts-service-limit">
                              <label className="settings-checkbox settings-checkbox-inline">
                                <input
                                  type="checkbox"
                                  checked={Boolean(selectedRow?.isUnlimited)}
                                  onChange={(event) => updateServiceRow(service.id, { isUnlimited: event.currentTarget.checked })}
                                />
                                <span>Безлимит</span>
                              </label>
                              <input
                                type="number"
                                min="1"
                                value={selectedRow?.isUnlimited ? "" : (selectedRow?.limitCount || "")}
                                placeholder="Кол-во"
                                disabled={Boolean(selectedRow?.isUnlimited)}
                                onChange={(event) => updateServiceRow(service.id, { limitCount: event.currentTarget.value })}
                              />
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>

              <div className="all-users-edit-actions finance-discounts-modal-actions">
                <button type="submit" className="btn" disabled={submitting}>
                  {submitting ? "Сохранение..." : "Создать"}
                </button>
                <button type="button" className="btn secondary" onClick={closeCreateModal} disabled={submitting}>
                  Отмена
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
