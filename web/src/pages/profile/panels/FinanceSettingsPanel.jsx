import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";
import { useI18n } from "../../../i18n/I18nProvider.jsx";
import { formatDateYMD } from "../../../lib/formatters.js";

const EMPTY_FORM = Object.freeze({
  id: "",
  name: "",
  sortOrder: "0",
  isActive: true
});

function normalizeForm(value) {
  return value && typeof value === "object" ? value : EMPTY_FORM;
}

function FinanceSettingsPanel({
  onClose,
  canCreateSettingsFinance,
  canUpdateSettingsFinance,
  canDeleteSettingsFinance
}) {
  const { translate } = useI18n();
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const currentForm = normalizeForm(form);

  const loadItems = useCallback(async () => {
    try {
      const response = await apiFetch("/api/settings/finance/payment-methods?status=all");
      const data = await readApiResponseData(response);
      if (!response.ok) {
        const nextMessage = data?.message || "Failed to load payment methods.";
        setMessage(nextMessage);
        window.alert?.(translate(nextMessage));
        return;
      }
      const nextItems = Array.isArray(data?.items) ? data.items : [];
      setItems(nextItems);
      setMessage(nextItems.length === 0 ? "No payment methods found." : "");
    } catch {
      setMessage("Failed to load payment methods.");
      window.alert?.(translate("Failed to load payment methods."));
    }
  }, [translate]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const isEditing = Boolean(currentForm.id);
  const resetForm = () => setForm(EMPTY_FORM);

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
    if (submitting || (isEditing ? !canUpdateSettingsFinance : !canCreateSettingsFinance)) return;
    setSubmitting(true);
    try {
      const payload = {
        name: currentForm.name.trim(),
        isActive: currentForm.isActive
      };
      if (isEditing) {
        payload.sortOrder = currentForm.sortOrder === "" ? 0 : currentForm.sortOrder;
      }
      const response = await apiFetch(
        isEditing ? `/api/settings/finance/payment-methods/${currentForm.id}` : "/api/settings/finance/payment-methods",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      const data = await readApiResponseData(response);
      if (!response.ok) {
        const nextMessage = data?.message || "Payment method save failed.";
        setMessage(nextMessage);
        window.alert?.(translate(nextMessage));
        return;
      }
      resetForm();
      setModalOpen(false);
      await loadItems();
    } catch {
      window.alert?.(translate("Payment method save failed."));
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (item) => {
    setForm({
      id: String(item?.id || ""),
      name: String(item?.name || ""),
      sortOrder: String(item?.sortOrder ?? 0),
      isActive: Boolean(item?.isActive)
    });
    setModalOpen(true);
  };

  const deactivate = async (item) => {
    const id = String(item?.id || "");
    if (!id || !canDeleteSettingsFinance || deletingId) return;
    setDeletingId(id);
    try {
      const response = await apiFetch(`/api/settings/finance/payment-methods/${id}`, { method: "DELETE" });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        const nextMessage = data?.message || "Payment method delete failed.";
        window.alert?.(translate(nextMessage));
        return;
      }
      await loadItems();
    } catch {
      window.alert?.(translate("Payment method delete failed."));
    } finally {
      setDeletingId("");
    }
  };

  const modalLayer = modalOpen && typeof document !== "undefined" ? createPortal((
    <>
      <section id="financePaymentMethodEditModal" className="logout-confirm-modal settings-edit-modal">
        <div className="all-users-head">
          <h3>{`${translate(isEditing ? "Edit" : "Create")} ${translate("Payment Method")}`}</h3>
          <button
            id="closeFinancePaymentMethodEditModalBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label={translate("Close finance settings panel")}
            onClick={closeModal}
          >
            ×
          </button>
        </div>
        <form className="auth-form settings-edit-form" noValidate onSubmit={submitForm}>
          <div className="field">
            <label htmlFor="financePaymentMethodModalName">{translate("Payment Method")}</label>
            <input
              id="financePaymentMethodModalName"
              type="text"
              maxLength={96}
              value={currentForm.name}
              placeholder={translate("Payment Method")}
              onChange={(event) => {
                const nextValue = event?.target?.value ?? "";
                setForm((current) => ({ ...normalizeForm(current), name: nextValue }));
              }}
            />
          </div>
          <div className="field settings-inline-control">
            <label htmlFor="financePaymentMethodModalIsActive">{translate("Active")}</label>
            <label className="settings-checkbox settings-checkbox-inline" htmlFor="financePaymentMethodModalIsActive">
              <input
                id="financePaymentMethodModalIsActive"
                type="checkbox"
                checked={currentForm.isActive}
                onChange={(event) => {
                  const nextChecked = Boolean(event?.target?.checked);
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
    <section id="financeSettingsPanel" className="all-users-panel settings-panel ops-panel-shell finance-panel-shell finance-settings-panel">
      <div className="all-users-head">
        <h3>{translate("Finance Settings")}</h3>
        <div className="all-users-head-actions">
          <button
            id="openFinancePaymentMethodCreateModalBtn"
            type="button"
            className="header-btn appointment-breaks-add-icon-btn"
            aria-label={translate("Create")}
            title={translate("Create")}
            hidden={!canCreateSettingsFinance}
            onClick={openCreateModal}
          >
            +
          </button>
          <button type="button" className="header-btn panel-close-btn" aria-label={translate("Close finance settings panel")} onClick={onClose}>
            ×
          </button>
        </div>
      </div>

      <h4>{translate("Payment Methods")}</h4>

      <p className="all-users-state" hidden={!message}>{translate(message)}</p>

      <div className="all-users-table-wrap settings-table-wrap" hidden={items.length === 0}>
        <table className="all-users-table settings-table" aria-label={translate("Payment methods table")}>
          <thead>
            <tr>
              <th>ID</th>
              <th>{translate("Payment Method")}</th>
              <th>{translate("Active")}</th>
              <th>{translate("Created")}</th>
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
                <td>{item.name || "-"}</td>
                <td>{translate(item.isActive ? "Yes" : "No")}</td>
                <td>{formatDateYMD(item.createdAt)}</td>
                <td>
                  <button
                    type="button"
                    className="table-action-btn services-settings-action-btn"
                    aria-label={translate("Edit")}
                    title={translate("Edit")}
                    hidden={!canUpdateSettingsFinance}
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
                    hidden={!canDeleteSettingsFinance}
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

export default FinanceSettingsPanel;
