import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";
import { useI18n } from "../../../i18n/I18nProvider.jsx";

const EMPTY_FORM = Object.freeze({
  id: "",
  positionId: "",
  name: "",
  priceUzs: "",
  isActive: true
});

function normalizeForm(value) {
  return value && typeof value === "object" ? value : EMPTY_FORM;
}

function formatPrice(value) {
  const amount = Number.parseInt(String(value ?? 0), 10) || 0;
  return `${amount.toLocaleString("ru-RU")} UZS`;
}

function ServicesSettingsPanel({
  onClose,
  canCreateSettingsServices,
  canUpdateSettingsServices,
  canDeleteSettingsServices
}) {
  const { translate } = useI18n();
  const [items, setItems] = useState([]);
  const [positions, setPositions] = useState([]);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const currentForm = normalizeForm(form);

  const loadData = useCallback(async () => {
    try {
      const [servicesResponse, positionsResponse] = await Promise.all([
        apiFetch("/api/settings/services?status=all"),
        apiFetch("/api/settings/positions")
      ]);
      const [servicesData, positionsData] = await Promise.all([
        readApiResponseData(servicesResponse),
        readApiResponseData(positionsResponse)
      ]);
      if (!servicesResponse.ok) {
        const nextMessage = servicesData?.message || "Failed to load services.";
        setMessage(nextMessage);
        window.alert?.(translate(nextMessage));
        return;
      }
      if (!positionsResponse.ok) {
        const nextMessage = positionsData?.message || "Failed to load positions.";
        setMessage(nextMessage);
        window.alert?.(translate(nextMessage));
        return;
      }
      const nextItems = Array.isArray(servicesData?.items) ? servicesData.items : [];
      setItems(nextItems);
      setPositions(Array.isArray(positionsData?.items) ? positionsData.items : []);
      setMessage(nextItems.length === 0 ? "No services found." : "");
    } catch {
      setMessage("Failed to load services.");
      window.alert?.(translate("Failed to load services."));
    }
  }, [translate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const positionOptions = useMemo(() => (
    positions
      .filter((item) => item?.isActive || String(item?.id) === String(currentForm.positionId))
      .map((item) => ({ value: String(item.id), label: String(item.label || "").trim() || `#${item.id}` }))
  ), [currentForm.positionId, positions]);

  const resetForm = () => setForm(EMPTY_FORM);
  const isEditing = Boolean(currentForm.id);

  const openCreateModal = () => {
    resetForm();
    setModalOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalOpen(false);
    resetForm();
  };

  const submitForm = async (event) => {
    event.preventDefault();
    if (submitting || (isEditing ? !canUpdateSettingsServices : !canCreateSettingsServices)) return;
    setSubmitting(true);
    try {
      const payload = {
        positionId: currentForm.positionId,
        name: currentForm.name.trim(),
        priceUzs: currentForm.priceUzs === "" ? 0 : currentForm.priceUzs,
        isActive: currentForm.isActive
      };
      const response = await apiFetch(isEditing ? `/api/settings/services/${currentForm.id}` : "/api/settings/services", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        const nextMessage = data?.message || "Service save failed.";
        setMessage(nextMessage);
        window.alert?.(translate(nextMessage));
        return;
      }
      resetForm();
      setModalOpen(false);
      await loadData();
    } catch {
      window.alert?.(translate("Service save failed."));
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (item) => {
    setForm({
      id: String(item?.id || ""),
      positionId: String(item?.positionId || ""),
      name: String(item?.name || ""),
      priceUzs: String(item?.priceUzs ?? 0),
      isActive: Boolean(item?.isActive)
    });
    setModalOpen(true);
  };

  const deactivate = async (item) => {
    const id = String(item?.id || "");
    if (!id || !canDeleteSettingsServices || deletingId) return;
    setDeletingId(id);
    try {
      const response = await apiFetch(`/api/settings/services/${id}`, { method: "DELETE" });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        const nextMessage = data?.message || "Service delete failed.";
        window.alert?.(translate(nextMessage));
        return;
      }
      await loadData();
    } catch {
      window.alert?.(translate("Service delete failed."));
    } finally {
      setDeletingId("");
    }
  };

  const modalLayer = modalOpen && typeof document !== "undefined" ? createPortal((
    <>
      <section id="serviceSettingsEditModal" className="logout-confirm-modal settings-edit-modal">
        <div className="all-users-head">
          <h3>{`${translate(isEditing ? "Edit" : "Create")} ${translate("Service")}`}</h3>
          <button
            id="closeServiceSettingsEditModalBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label={translate("Close service settings panel")}
            onClick={closeModal}
          >
            ×
          </button>
        </div>
        <form className="auth-form settings-edit-form" noValidate onSubmit={submitForm}>
          <div className="field">
            <label htmlFor="serviceSettingsModalPosition">{translate("Position")}</label>
            <select
              id="serviceSettingsModalPosition"
              value={currentForm.positionId}
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                setForm((current) => ({ ...normalizeForm(current), positionId: nextValue }));
              }}
            >
              <option value="">{translate("Position")}</option>
              {positionOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="serviceSettingsModalName">{translate("Service Name")}</label>
            <input
              id="serviceSettingsModalName"
              type="text"
              maxLength={128}
              value={currentForm.name}
              placeholder={translate("Service Name")}
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                setForm((current) => ({ ...normalizeForm(current), name: nextValue }));
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="serviceSettingsModalPrice">{translate("Price")}</label>
            <input
              id="serviceSettingsModalPrice"
              type="number"
              min="0"
              value={currentForm.priceUzs}
              placeholder={translate("Price")}
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                setForm((current) => ({ ...normalizeForm(current), priceUzs: nextValue }));
              }}
            />
          </div>
          <div className="field settings-inline-control">
            <label htmlFor="serviceSettingsModalIsActive">{translate("Active")}</label>
            <label className="settings-checkbox settings-checkbox-inline" htmlFor="serviceSettingsModalIsActive">
              <input
                id="serviceSettingsModalIsActive"
                type="checkbox"
                checked={currentForm.isActive}
                onChange={(event) => {
                  const nextChecked = event.currentTarget.checked;
                  setForm((current) => ({ ...normalizeForm(current), isActive: nextChecked }));
                }}
              />
            </label>
          </div>
          <div className="edit-actions">
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? "..." : translate("Save")}
            </button>
          </div>
        </form>
      </section>
      <div className="login-overlay" onClick={closeModal} />
    </>
  ), document.body) : null;

  return (
    <section id="servicesSettingsPanel" className="all-users-panel settings-panel ops-panel-shell services-settings-panel">
      <div className="all-users-head">
        <h3>{translate("Service Settings")}</h3>
        <div className="all-users-head-actions">
          <button
            id="openServiceCreateModalBtn"
            type="button"
            className="header-btn appointment-breaks-add-icon-btn"
            aria-label={translate("Create")}
            title={translate("Create")}
            hidden={!canCreateSettingsServices}
            onClick={openCreateModal}
          >
            +
          </button>
          <button type="button" className="header-btn panel-close-btn" aria-label={translate("Close service settings panel")} onClick={onClose}>
            ×
          </button>
        </div>
      </div>

      <p className="all-users-state" hidden={!message}>{translate(message)}</p>

      <div className="all-users-table-wrap settings-table-wrap" hidden={items.length === 0}>
        <table className="all-users-table settings-table" aria-label={translate("Service settings table")}>
          <thead>
            <tr>
              <th>ID</th>
              <th>{translate("Position")}</th>
              <th>{translate("Service Name")}</th>
              <th>{translate("Price")}</th>
              <th>{translate("Active")}</th>
              <th aria-label={translate("Edit")}>✎</th>
              <th aria-label={translate("Delete")}>
                <span className="services-settings-trash-icon" aria-hidden="true" />
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={String(item.id)}>
                <td>{item.id}</td>
                <td>{item.positionLabel || "-"}</td>
                <td>{item.name || "-"}</td>
                <td>{formatPrice(item.priceUzs)}</td>
                <td>{translate(item.isActive ? "Yes" : "No")}</td>
                <td>
                  <button
                    type="button"
                    className="table-action-btn services-settings-action-btn"
                    aria-label={translate("Edit")}
                    title={translate("Edit")}
                    hidden={!canUpdateSettingsServices}
                    onClick={() => startEdit(item)}
                  >
                    ✎
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    className="table-action-btn table-action-btn-danger services-settings-action-btn"
                    aria-label={translate("Delete")}
                    title={translate("Delete")}
                    hidden={!canDeleteSettingsServices}
                    disabled={deletingId === String(item.id) || !item.isActive}
                    onClick={() => deactivate(item)}
                  >
                    {deletingId === String(item.id) ? "..." : (
                      <span className="services-settings-trash-icon" aria-hidden="true" />
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modalLayer}
    </section>
  );
}

export default ServicesSettingsPanel;
