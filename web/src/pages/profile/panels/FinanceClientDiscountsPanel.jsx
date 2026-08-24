import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CustomSelect from "../../../components/CustomSelect.jsx";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";
import { formatDateTimeTashkent, formatDateYMD } from "../../../lib/formatters.js";
import { useEscapeKey } from "../../../lib/use-escape-key.js";
import { useI18n } from "../../../i18n/I18nProvider.jsx";

const EMPTY_CREATE_FORM = Object.freeze({
  discountType: "amount",
  note: ""
});

const EMPTY_FILTERS = Object.freeze({
  createdFrom: "",
  createdTo: "",
  client: "",
  service: "",
  isActive: "true"
});

const DISCOUNT_TYPE_OPTIONS = Object.freeze([
  { value: "amount", label: "Сумма" },
  { value: "percent", label: "Процент" }
]);

const DISCOUNT_ACTIVE_FILTER_OPTIONS = Object.freeze([
  { value: "", label: "All" },
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive" }
]);

const DISCOUNT_MAX_LIMIT_COUNT = 22;
const DISCOUNT_MAX_PERCENT_VALUE = 100;
const DISCOUNT_UNLIMITED_VALUE = "unlimited";
const DISCOUNT_LIMIT_OPTIONS = Object.freeze([
  ...Array.from({ length: DISCOUNT_MAX_LIMIT_COUNT }, (_, index) => {
    const value = String(index + 1);
    return { value, label: value };
  }),
  { value: DISCOUNT_UNLIMITED_VALUE, label: "Unlimited" }
]);

const STATUS_LABELS = Object.freeze({
  active: "Active",
  completed: "Completed",
  unlimited: "Unlimited",
  disabled: "Disabled"
});

function toIntegerAmount(value) {
  return Number.parseInt(String(value ?? 0), 10) || 0;
}

function normalizeCreateDiscountValue(discountType, value) {
  const rawValue = String(value ?? "");
  if (String(discountType || "") !== "percent" || rawValue.trim() === "") {
    return rawValue;
  }
  const amount = toIntegerAmount(rawValue);
  return amount > DISCOUNT_MAX_PERCENT_VALUE ? String(DISCOUNT_MAX_PERCENT_VALUE) : rawValue;
}

function formatMoney(value) {
  const amount = toIntegerAmount(value);
  return amount.toLocaleString("ru-RU");
}

function formatServiceOptionLabel(service) {
  const name = String(service?.name || service?.id || "").trim() || "-";
  const priceUzs = toIntegerAmount(service?.priceUzs ?? service?.price_uzs);
  const priceLabel = priceUzs > 0 ? `${formatMoney(priceUzs)} сум` : "-";
  return `${name} - ${priceLabel}`;
}

function formatDiscount(item, translate = (value) => value) {
  const services = Array.isArray(item?.services) ? item.services : [];
  const discountType = String(item?.discountType || item?.discount_type) === "percent" ? "percent" : "amount";
  const serviceValues = services
    .map((service) => (
      discountType === "percent"
        ? toIntegerAmount(service?.discountValue ?? service?.discount_value)
        : toIntegerAmount(service?.perUseDiscountUzs ?? service?.per_use_discount_uzs ?? service?.discountValue ?? service?.discount_value)
    ))
    .filter((value) => value > 0);
  const uniqueValues = new Set(serviceValues);
  if (serviceValues.length > 0 && uniqueValues.size > 1) {
    return translate("By service");
  }
  const value = serviceValues[0] ?? toIntegerAmount(item?.discountValue ?? item?.discount_value);
  return discountType === "percent"
    ? `${value}%`
    : `${formatMoney(value)} сум`;
}

function getServicePriceUzs(service) {
  return toIntegerAmount(service?.servicePriceUzs ?? service?.service_price_uzs ?? service?.priceUzs ?? service?.price_uzs);
}

function getServiceDiscountUzs(service, discountType) {
  const priceUzs = getServicePriceUzs(service);
  const normalizedDiscountType = String(discountType || "") === "percent" ? "percent" : "amount";
  const discountValue = toIntegerAmount(service?.discountValue ?? service?.discount_value);
  if (normalizedDiscountType === "percent") {
    return Math.min(priceUzs, Math.floor((priceUzs * Math.min(discountValue, DISCOUNT_MAX_PERCENT_VALUE)) / 100));
  }
  return Math.min(priceUzs, toIntegerAmount(service?.perUseDiscountUzs ?? service?.per_use_discount_uzs ?? discountValue));
}

function formatServiceDiscountDetail(service, discountType) {
  const normalizedDiscountType = String(discountType || "") === "percent" ? "percent" : "amount";
  const discountUzs = getServiceDiscountUzs(service, normalizedDiscountType);
  if (normalizedDiscountType === "percent") {
    const discountValue = toIntegerAmount(service?.discountValue ?? service?.discount_value);
    return `${discountValue}% · ${formatMoney(discountUzs)} сум`;
  }
  return `${formatMoney(discountUzs)} сум`;
}

function getServiceFinalPriceUzs(service, discountType) {
  return Math.max(getServicePriceUzs(service) - getServiceDiscountUzs(service, discountType), 0);
}

function getStatusClassName(status) {
  const normalized = String(status || "active").toLowerCase();
  if (normalized === "completed") return "is-completed";
  if (normalized === "disabled") return "is-disabled";
  if (normalized === "unlimited") return "is-unlimited";
  return "is-active";
}

function isUnlimitedDiscountService(service) {
  return service?.limitCount === null || service?.limit_count === null;
}

function formatServiceProgress(service, translate) {
  if (isUnlimitedDiscountService(service)) {
    return translate("Unlimited");
  }
  const usedCount = toIntegerAmount(service?.usedCount ?? service?.used_count);
  const limitCount = toIntegerAmount(service?.limitCount ?? service?.limit_count);
  return `${usedCount}/${limitCount}`;
}

function getServiceSummary(item, translate) {
  const services = Array.isArray(item?.services) ? item.services : [];
  if (services.length === 0) return "-";
  const visible = services.slice(0, 3).map((service) => {
    const name = String(service?.serviceName || service?.service_name || "").trim() || "-";
    return `${name} (${formatServiceProgress(service, translate)})`;
  });
  if (services.length > visible.length) {
    visible.push(`+${services.length - visible.length}`);
  }
  return visible.join(", ");
}

function normalizeClientLabel(client) {
  const id = String(client?.id ?? client?.clientId ?? "").trim();
  const name = String(client?.fullName || client?.full_name || client?.clientName || "").trim();
  const phone = String(client?.phone || client?.phone_number || "").trim();
  return [id ? `#${id}` : "", name, phone].filter(Boolean).join(" · ");
}

function createDiscountServiceRow() {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    serviceId: "",
    serviceName: "",
    limitCount: "1",
    isUnlimited: false,
    discountValue: ""
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
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [quickClientQuery, setQuickClientQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [services, setServices] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [clientSearch, setClientSearch] = useState("");
  const [clientOptions, setClientOptions] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const clientInputRef = useRef(null);
  const [clientResultsStyle, setClientResultsStyle] = useState(null);
  const [serviceRows, setServiceRows] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState("");
  const [detail, setDetail] = useState(null);
  const [disableTarget, setDisableTarget] = useState(null);
  const [disableReason, setDisableReason] = useState("");
  const [disableSubmitting, setDisableSubmitting] = useState(false);
  const [disableError, setDisableError] = useState("");

  const discountServiceOptions = useMemo(() => services.filter(Boolean).map((service) => ({
    value: String(service.id),
    label: formatServiceOptionLabel(service),
    selectedLabel: formatServiceOptionLabel(service),
    item: service
  })), [services]);
  const filterServiceOptions = useMemo(() => [
    { value: "", label: translate("All") },
    ...services.filter(Boolean).map((service) => ({
      value: String(service.name || service.id),
      label: String(service.name || service.id)
    }))
  ], [services, translate]);
  const showClientResults = createOpen && !selectedClient && clientOptions.length > 0;

  const loadDiscounts = useCallback(async (nextPage = 1, nextFilters = EMPTY_FILTERS) => {
    try {
      setLoading(true);
      setMessage("");
      const params = new URLSearchParams();
      params.set("page", String(nextPage));
      params.set("pageSize", "20");
      Object.entries(nextFilters || {}).forEach(([key, value]) => {
        const normalized = String(value || "").trim();
        if (normalized) {
          params.set(key, normalized);
        }
      });
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
    void loadDiscounts(1, appliedFilters);
    void loadReferences();
  }, [loadDiscounts, loadReferences]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const normalizedClient = String(quickClientQuery || "").trim();
      const appliedClient = String(appliedFilters.client || "").trim();
      if (normalizedClient === appliedClient) return;
      const nextFilters = { ...appliedFilters, client: normalizedClient };
      setFilters((current) => ({ ...current, client: normalizedClient }));
      setAppliedFilters(nextFilters);
      void loadDiscounts(1, nextFilters);
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [appliedFilters, loadDiscounts, quickClientQuery]);

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

  useEffect(() => {
    if (!showClientResults || typeof window === "undefined") {
      setClientResultsStyle(null);
      return undefined;
    }

    const updateClientResultsLayout = () => {
      if (!clientInputRef.current) {
        setClientResultsStyle(null);
        return;
      }

      const rect = clientInputRef.current.getBoundingClientRect();
      const viewportPadding = 8;
      const desiredMaxHeight = 190;
      const desiredHeight = Math.min(desiredMaxHeight, (clientOptions.length * 33) + 10);
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const openUp = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
      const availableSpace = Math.max(96, openUp ? spaceAbove : spaceBelow);
      const maxHeight = Math.max(96, Math.min(desiredMaxHeight, availableSpace - viewportPadding));
      const width = Math.min(Math.max(220, rect.width), window.innerWidth - (viewportPadding * 2));
      const left = Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - width - viewportPadding));
      const preferredTop = openUp ? rect.top - maxHeight - 4 : rect.bottom + 4;
      const top = Math.max(viewportPadding, Math.min(preferredTop, window.innerHeight - maxHeight - viewportPadding));

      setClientResultsStyle({
        position: "fixed",
        top: `${top}px`,
        left: `${left}px`,
        width: `${width}px`,
        maxHeight: `${maxHeight}px`
      });
    };

    updateClientResultsLayout();
    window.addEventListener("resize", updateClientResultsLayout);
    window.addEventListener("scroll", updateClientResultsLayout, true);
    return () => {
      window.removeEventListener("resize", updateClientResultsLayout);
      window.removeEventListener("scroll", updateClientResultsLayout, true);
    };
  }, [clientOptions.length, showClientResults]);

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
  }, []);

  const closeDisableModal = useCallback(() => {
    if (disableSubmitting) return;
    setDisableTarget(null);
    setDisableReason("");
    setDisableError("");
  }, [disableSubmitting]);

  const closeFilters = useCallback(() => {
    if (loading) return;
    setFiltersOpen(false);
  }, [loading]);

  const applyFilters = useCallback((event) => {
    event.preventDefault();
    const nextFilters = {
      ...filters,
      client: String(filters.client || "").trim()
    };
    setFilters(nextFilters);
    setAppliedFilters(nextFilters);
    setQuickClientQuery(nextFilters.client);
    setFiltersOpen(false);
    void loadDiscounts(1, nextFilters);
  }, [filters, loadDiscounts]);

  useEscapeKey(createOpen, closeCreateModal);
  useEscapeKey(Boolean(detail), closeDetailModal);
  useEscapeKey(filtersOpen, closeFilters);
  useEscapeKey(Boolean(disableTarget), closeDisableModal);

  const openCreateModal = useCallback(() => {
    setCreateOpen(true);
    setServiceRows((current) => (current.length > 0 ? current : [createDiscountServiceRow()]));
    if (services.length === 0) {
      void loadReferences();
    }
  }, [loadReferences, services.length]);

  const updateCreateForm = useCallback((field, value) => {
    setCreateError("");
    if (field === "discountType") {
      const discountType = String(value || "amount");
      setServiceRows((current) => current.map((row) => ({
        ...row,
        discountValue: normalizeCreateDiscountValue(discountType, row.discountValue)
      })));
      setCreateForm((current) => ({
        ...current,
        discountType
      }));
      return;
    }
    setCreateForm((current) => {
      return {
        ...current,
        [field]: value
      };
    });
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
    const invalidDiscountValue = selectedServiceRows.some((row) => toIntegerAmount(row.discountValue) <= 0);
    if (invalidDiscountValue) {
      setCreateError("Discount is required for each service.");
      return;
    }
    if (createForm.discountType === "percent" && selectedServiceRows.some((row) => toIntegerAmount(row.discountValue) > DISCOUNT_MAX_PERCENT_VALUE)) {
      setCreateError("Percent discount cannot exceed 100.");
      return;
    }
    if (createForm.discountType === "amount") {
      const ineffectiveAmountRow = selectedServiceRows.find((row) => (
        !row.isUnlimited
        && toIntegerAmount(row.limitCount) > 0
        && Math.floor(toIntegerAmount(row.discountValue) / toIntegerAmount(row.limitCount)) <= 0
      ));
      if (ineffectiveAmountRow) {
        setCreateError("Discount is required for each service.");
        return;
      }
      const invalidAmountRow = selectedServiceRows.find((row) => {
        const service = services.find((entry) => String(entry.id) === String(row.serviceId || ""));
        const priceUzs = toIntegerAmount(service?.priceUzs ?? service?.price_uzs);
        const maxDiscountUzs = row.isUnlimited
          ? priceUzs
          : priceUzs * toIntegerAmount(row.limitCount);
        return priceUzs > 0 && toIntegerAmount(row.discountValue) > maxDiscountUzs;
      });
      if (invalidAmountRow) {
        setCreateError("Discount cannot be greater than service total.");
        return;
      }
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
          discountValue: toIntegerAmount(selectedServiceRows[0]?.discountValue),
          note: createForm.note,
          services: selectedServiceRows.map((row) => {
            const servicePayload = {
              serviceId: row.serviceId,
              discountValue: toIntegerAmount(row.discountValue),
              isUnlimited: Boolean(row.isUnlimited)
            };
            if (!row.isUnlimited) {
              servicePayload.limitCount = toIntegerAmount(row.limitCount);
            }
            return servicePayload;
          })
        })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setCreateError(data?.message || "Не удалось создать скидку.");
        return;
      }
      closeCreateModal();
      await loadDiscounts(1, appliedFilters);
    } catch {
      setCreateError("Не удалось создать скидку.");
    } finally {
      setSubmitting(false);
    }
  }, [appliedFilters, closeCreateModal, createForm.discountType, createForm.note, loadDiscounts, selectedClient, serviceRows, services]);

  const openDetail = useCallback(async (item) => {
    const id = item?.id;
    if (!id) return;
    try {
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
    }
  }, []);

  const openDisableModal = useCallback((item) => {
    if (!canUpdateFinanceDiscounts || !item?.id) return;
    setDisableTarget(item);
    setDisableReason("");
    setDisableError("");
  }, [canUpdateFinanceDiscounts]);

  const submitDisableDiscount = useCallback(async (event) => {
    event.preventDefault();
    if (!canUpdateFinanceDiscounts || !disableTarget?.id) return;
    const reason = disableReason.trim();
    if (!reason) {
      setDisableError(translate("Disable reason is required."));
      return;
    }
    try {
      setDisableSubmitting(true);
      const response = await apiFetch(`/api/finance/discounts/${encodeURIComponent(disableTarget.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false, disableReason: reason })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setDisableError(data?.message || "Не удалось обновить скидку.");
        return;
      }
      setDisableTarget(null);
      setDisableReason("");
      setDisableError("");
      await loadDiscounts(page, appliedFilters);
    } catch {
      setDisableError("Не удалось обновить скидку.");
    } finally {
      setDisableSubmitting(false);
    }
  }, [appliedFilters, canUpdateFinanceDiscounts, disableReason, disableTarget, loadDiscounts, page, translate]);

  const modalRoot = typeof document !== "undefined" ? document.body : null;
  const detailItem = detail?.item || null;
  const detailServices = Array.isArray(detailItem?.services) ? detailItem.services : [];
  const detailServicesAreAllUnlimited = detailServices.length > 0 && detailServices.every(isUnlimitedDiscountService);
  const detailUsages = Array.isArray(detail?.usages) ? detail.usages : [];
  const clientResultsElement = showClientResults && modalRoot ? createPortal(
    <div
      className="finance-discounts-client-results"
      style={clientResultsStyle || { position: "fixed", top: "-9999px", left: "-9999px", width: "0px", maxHeight: "0px" }}
      onWheel={(event) => event.stopPropagation()}
      onTouchMove={(event) => event.stopPropagation()}
    >
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
    </div>,
    modalRoot
  ) : null;

  return (
    <section id="financeClientDiscountsPanel" className="all-users-panel settings-panel ops-panel-shell finance-panel-shell finance-discounts-panel">
      <div className="all-users-head finance-discounts-head">
        <h3>{translate("Client Discounts")}</h3>
        <div className="all-users-head-actions">
          <input
            type="search"
            className="panel-search-input finance-board-head-client-filter finance-discounts-head-client-filter"
            value={quickClientQuery}
            aria-label={translate("Search by name or ID")}
            placeholder={translate("Client")}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setQuickClientQuery(value);
            }}
          />
          <button
            type="button"
            className="table-action-btn finance-head-icon-btn"
            aria-label={translate("Filter")}
            title={translate("Filter")}
            onClick={() => {
              setFiltersOpen(true);
              if (services.length === 0) {
                void loadReferences();
              }
            }}
          >
            <span className="finance-head-icon finance-head-icon-filter" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="header-btn appointment-breaks-add-icon-btn"
            onClick={openCreateModal}
            disabled={!canCreateFinanceDiscounts}
            title={translate("Create discount")}
            aria-label={translate("Create discount")}
          >
            +
          </button>
          <button
            type="button"
            className="header-btn panel-close-btn"
            onClick={onClose}
            aria-label={translate("Close finance discounts panel")}
          >
            ×
          </button>
        </div>
      </div>

      {message ? <p className="all-users-state">{translate(message)}</p> : null}

      {filtersOpen && modalRoot ? createPortal((
        <>
          <button
            type="button"
            className="login-overlay stacked-modal-overlay finance-modal-overlay"
            aria-label={translate("Close")}
            onClick={closeFilters}
          />
          <div id="financeClientDiscountFilterModal" className="logout-confirm-modal all-users-edit-modal finance-modal finance-discounts-filter-modal">
            <h3>{translate("Filter")}</h3>
            <form className="auth-form" onSubmit={applyFilters}>
              <div className="all-users-edit-fields settings-filter-grid finance-discounts-filter-grid">
                <div className="finance-discounts-filter-date-row">
                  <label className="field">
                    <span>{translate("Created From")}</span>
                    <input
                      type="date"
                      value={filters.createdFrom}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setFilters((current) => ({ ...current, createdFrom: value }));
                      }}
                    />
                  </label>
                  <label className="field">
                    <span>{translate("Created To")}</span>
                    <input
                      type="date"
                      value={filters.createdTo}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setFilters((current) => ({ ...current, createdTo: value }));
                      }}
                    />
                  </label>
                </div>
                <label className="field">
                  <span>{translate("Client")}</span>
                  <input
                    type="search"
                    value={filters.client}
                    placeholder={translate("Search by name or ID")}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setFilters((current) => ({ ...current, client: value }));
                    }}
                  />
                </label>
                <label className="field">
                  <span>{translate("Service Name")}</span>
                  <CustomSelect
                    value={filters.service}
                    options={filterServiceOptions}
                    placeholder={translate("All")}
                    searchable
                    searchPlaceholder={translate("Search")}
                    searchThreshold={1}
                    menuPortal
                    disabled={services.length === 0}
                    onChange={(value) => setFilters((current) => ({ ...current, service: value }))}
                  />
                </label>
                <label className="field">
                  <span>{translate("Status")}</span>
                  <CustomSelect
                    value={filters.isActive}
                    options={DISCOUNT_ACTIVE_FILTER_OPTIONS.map((option) => ({
                      ...option,
                      label: translate(option.label)
                    }))}
                    placeholder={translate("All")}
                    menuPortal
                    onChange={(value) => setFilters((current) => ({ ...current, isActive: value }))}
                  />
                </label>
              </div>
              <div className="edit-actions">
                <button type="submit" className="btn btn-primary" disabled={loading}>{translate("Search")}</button>
              </div>
            </form>
          </div>
        </>
      ), modalRoot) : null}

      <div className="all-users-table-scroll">
        <table className="all-users-table finance-discounts-table" aria-label={translate("Client Discounts")}>
          <colgroup>
            <col className="finance-discounts-col-client" />
            <col className="finance-discounts-col-client-id" />
            <col className="finance-discounts-col-created" />
            <col className="finance-discounts-col-services" />
            <col className="finance-discounts-col-discount" />
            <col className="finance-discounts-col-remaining" />
            <col className="finance-discounts-col-status" />
            <col className="finance-discounts-col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th>{translate("Client")}</th>
              <th>{translate("Client ID")}</th>
              <th>{translate("Created")}</th>
              <th>{translate("Services")}</th>
              <th>{translate("Discount")}</th>
              <th>{translate("Remaining")}</th>
              <th>{translate("Status")}</th>
              <th>{translate("Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="all-users-state">{translate("Loading...")}</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="all-users-state">{translate("No discounts.")}</td>
              </tr>
            ) : items.map((item) => (
              <tr
                key={item.id}
                className="finance-discounts-row"
                onDoubleClick={() => openDetail(item)}
              >
                <td className="finance-discounts-cell-client">{item.clientName || "-"}</td>
                <td className="finance-discounts-cell-client-id">{item.clientId ?? item.client_id ?? "-"}</td>
                <td className="finance-discounts-cell-created">{formatDateYMD(item.createdAt || item.created_at)}</td>
                <td className="finance-discounts-cell-services">{getServiceSummary(item, translate)}</td>
                <td className="finance-discounts-cell-money">{formatDiscount(item, translate)}</td>
                <td className="finance-discounts-cell-remaining">{item.remainingCount === null ? translate("Unlimited") : toIntegerAmount(item.remainingCount)}</td>
                <td>
                  <span className={`finance-discount-status ${getStatusClassName(item.status)}`}>
                    {translate(STATUS_LABELS[item.status] || item.status)}
                  </span>
                </td>
                <td>
                  <div className="finance-discount-actions">
                    {item.isActive ? (
                      <button
                        type="button"
                        className="table-action-btn table-action-btn-danger finance-discounts-icon-btn"
                        aria-label={translate("Disable")}
                        title={translate("Disable")}
                        onClick={() => openDisableModal(item)}
                        disabled={!canUpdateFinanceDiscounts}
                      >
                        <span className="table-trash-icon" aria-hidden="true" />
                      </button>
                    ) : "-"}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="table-pagination">
        <button
          type="button"
          className="table-action-btn"
          disabled={page <= 1 || loading}
          onClick={() => loadDiscounts(page - 1, appliedFilters)}
        >
          {translate("Previous")}
        </button>
        <span>{`${page} / ${totalPages}`}</span>
        <button
          type="button"
          className="table-action-btn"
          disabled={page >= totalPages || loading}
          onClick={() => loadDiscounts(page + 1, appliedFilters)}
        >
          {translate("Next")}
        </button>
      </div>

      {createOpen && modalRoot ? createPortal(
        <div className="finance-modal-overlay" role="presentation">
          <div id="financeClientDiscountCreateModal" className="logout-confirm-modal all-users-edit-modal finance-modal finance-discounts-modal">
            <form className="auth-form finance-discounts-create-form" onSubmit={submitCreate}>
              <div className="finance-discounts-create-head">
                <h3>{translate("New Client Discount")}</h3>
                <button
                  type="button"
                  className="header-btn panel-close-btn"
                  onClick={closeCreateModal}
                  disabled={submitting}
                  aria-label={translate("Close")}
                >
                  ×
                </button>
              </div>

              <div className="finance-discounts-create-body">
                <div className="finance-discounts-simple-form">
                  <div className="finance-discounts-discount-row">
                    <div className="field finance-discounts-client-field">
                      <input
                        ref={clientInputRef}
                        type="search"
                        value={selectedClient ? normalizeClientLabel(selectedClient) : clientSearch}
                        placeholder="Клиент"
                        onChange={(event) => {
                          setCreateError("");
                          setSelectedClient(null);
                          setClientSearch(event.currentTarget.value);
                        }}
                      />
                    </div>
                    <div className="field finance-discounts-type-field">
                      <CustomSelect
                        value={createForm.discountType}
                        options={DISCOUNT_TYPE_OPTIONS}
                        onChange={(value) => updateCreateForm("discountType", value)}
                        placeholder="Тип скидки"
                        menuPortal
                      />
                    </div>
                  </div>

                  {createError ? <p className="all-users-state finance-discounts-modal-error">{translate(createError)}</p> : null}

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
                                updateServiceRow(row.key, { isUnlimited: true, limitCount: "" });
                                return;
                              }
                              updateServiceRow(row.key, { isUnlimited: false, limitCount: value });
                            }}
                          />
                        </label>
                        <label className="field finance-discounts-service-value-field">
                          <input
                            type="number"
                            min="1"
                            max={createForm.discountType === "percent" ? String(DISCOUNT_MAX_PERCENT_VALUE) : undefined}
                            placeholder={createForm.discountType === "percent" ? "Процент" : "Сумма"}
                            value={row.discountValue}
                            onChange={(event) => {
                              updateServiceRow(row.key, {
                                discountValue: normalizeCreateDiscountValue(createForm.discountType, event.currentTarget.value)
                              });
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
                  {submitting ? translate("Saving...") : translate("Create")}
                </button>
              </div>
            </form>
          </div>
        </div>,
        modalRoot
      ) : null}
      {clientResultsElement}

      {detail && modalRoot ? createPortal(
        <div className="finance-modal-overlay" role="presentation">
          <div id="financeClientDiscountDetailModal" className="logout-confirm-modal all-users-edit-modal finance-modal finance-discounts-detail-modal">
            <div className="finance-discounts-detail-head">
              <div>
                <h3>Скидка #{detailItem?.id}</h3>
                <p>{detailItem?.clientName || "-"}</p>
              </div>
              <button type="button" className="header-btn panel-close-btn" onClick={closeDetailModal} aria-label={translate("Close")}>
                ×
              </button>
            </div>
            <div className="finance-discounts-detail-body">
              <div className="finance-ticket-summary finance-discounts-detail-summary">
                <div>
                  <span>{translate("Discount")}</span>
                  <strong>{formatDiscount(detailItem, translate)}</strong>
                </div>
                <div>
                  <span>{translate("Used")}</span>
                  <strong>{toIntegerAmount(detailItem?.usedCount)}</strong>
                </div>
                <div>
                  <span>{translate("Remaining")}</span>
                  <strong>{detailItem?.remainingCount === null ? translate("Unlimited") : toIntegerAmount(detailItem?.remainingCount)}</strong>
                </div>
              </div>
              {detailItem?.disabledReason ? (
                <div className="finance-discounts-disable-note">
                  <span>{translate("Disable reason")}</span>
                  <strong>{detailItem.disabledReason}</strong>
                  <small>
                    {formatDateTimeTashkent(detailItem.disabledAt)}
                    {detailItem.disabledByName ? ` · ${detailItem.disabledByName}` : ""}
                  </small>
                </div>
              ) : null}
              <div className="finance-discounts-detail-sections">
                <section className="finance-discounts-detail-section">
                  <h4>Услуги</h4>
                  <div className="finance-discounts-detail-services">
                    {detailServices.map((service) => (
                      <div key={service.id} className="finance-discounts-detail-service">
                        <div className="finance-discounts-detail-service-main">
                          <strong>{service.serviceName}</strong>
                          <span>{formatServiceProgress(service, translate)}</span>
                        </div>
                        <div className="finance-discounts-detail-service-metrics">
                          <span className="finance-discounts-detail-service-metric">
                            <small>{translate("Price")}</small>
                            <b>{formatMoney(getServicePriceUzs(service))} сум</b>
                          </span>
                          <span className="finance-discounts-detail-service-metric">
                            <small>{translate("Discount")}</small>
                            <b>{formatServiceDiscountDetail(service, detailItem?.discountType)}</b>
                          </span>
                          <span className="finance-discounts-detail-service-metric is-final">
                            <small>{translate("Final")}</small>
                            <b>{formatMoney(getServiceFinalPriceUzs(service, detailItem?.discountType))} сум</b>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
                {detailServicesAreAllUnlimited ? null : (
                  <section className="finance-discounts-detail-section">
                    <h4>История использования</h4>
                    <div className="all-users-table-scroll finance-discounts-usage-scroll">
                      <table className="all-users-table finance-discounts-usage-table">
                        <thead>
                          <tr>
                            <th className="finance-discounts-usage-col-date">Дата</th>
                            <th className="finance-discounts-usage-col-ticket">Талон</th>
                            <th className="finance-discounts-usage-col-service">Услуга</th>
                            <th className="finance-discounts-usage-col-discount">Скидка</th>
                            <th className="finance-discounts-usage-col-status">Статус</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailUsages.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="all-users-state">Использований нет.</td>
                            </tr>
                          ) : detailUsages.map((usage) => (
                            <tr key={usage.id}>
                              <td className="finance-discounts-usage-cell-date">{formatDateTimeTashkent(usage.createdAt || usage.created_at)}</td>
                              <td className="finance-discounts-usage-cell-ticket">{usage.ticketNumber ? `#${usage.ticketNumber}` : "-"}</td>
                              <td className="finance-discounts-usage-cell-service">{usage.serviceName || "-"}</td>
                              <td className="finance-discounts-usage-cell-discount">{formatMoney(usage.discountUzs)} сум</td>
                              <td className="finance-discounts-usage-cell-status">{usage.isReversed ? "Отменено" : "Активно"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
              </div>
            </div>
          </div>
        </div>,
        modalRoot
      ) : null}
      {disableTarget && modalRoot ? createPortal(
        <div className="finance-modal-overlay" role="presentation">
          <form id="financeClientDiscountDisableModal" className="logout-confirm-modal all-users-edit-modal finance-modal finance-discounts-disable-modal" onSubmit={submitDisableDiscount}>
            <div className="finance-discounts-detail-head">
              <h3>{translate("Disable discount")}</h3>
              <button type="button" className="header-btn panel-close-btn" onClick={closeDisableModal} aria-label={translate("Close")}>
                ×
              </button>
            </div>
            <div className="finance-discounts-disable-body">
              <textarea
                value={disableReason}
                placeholder={translate("Disable reason")}
                maxLength={255}
                required
                onChange={(event) => {
                  setDisableError("");
                  setDisableReason(event.currentTarget.value);
                }}
              />
              {disableError ? <p className="finance-discounts-modal-error">{disableError}</p> : null}
              <div className="finance-discounts-disable-actions">
                <button type="submit" className="btn" disabled={disableSubmitting}>
                  {disableSubmitting ? translate("Saving...") : translate("Disable discount")}
                </button>
              </div>
            </div>
          </form>
        </div>,
        modalRoot
      ) : null}
    </section>
  );
}

export default FinanceClientDiscountsPanel;
