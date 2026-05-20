import { useCallback, useEffect, useMemo, useState } from "react";
import CustomSelect from "../../../components/CustomSelect.jsx";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";
import { useI18n } from "../../../i18n/I18nProvider.jsx";
import { formatDateYMD } from "../../../lib/formatters.js";

const EMPTY_FORM = Object.freeze({
  id: "",
  name: "",
  sortOrder: "0",
  isActive: true
});

function FinanceSettingsPanel({
  onClose,
  canCreateSettingsFinance,
  canUpdateSettingsFinance,
  canDeleteSettingsFinance
}) {
  const { translate } = useI18n();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("active");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  const statusOptions = useMemo(() => [
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
    { value: "all", label: "All" }
  ], []);

  const loadItems = useCallback(async () => {
    try {
      const response = await apiFetch(`/api/settings/finance/payment-methods?status=${encodeURIComponent(status)}`);
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
  }, [status, translate]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const isEditing = Boolean(form.id);
  const resetForm = () => setForm(EMPTY_FORM);

  const submitForm = async (event) => {
    event.preventDefault();
    if (submitting || (isEditing ? !canUpdateSettingsFinance : !canCreateSettingsFinance)) return;
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        sortOrder: form.sortOrder === "" ? 0 : form.sortOrder,
        isActive: form.isActive
      };
      const response = await apiFetch(
        isEditing ? `/api/settings/finance/payment-methods/${form.id}` : "/api/settings/finance/payment-methods",
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
      await loadItems();
    } catch {
      window.alert?.(translate("Payment method save failed."));
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (item) => setForm({
    id: String(item?.id || ""),
    name: String(item?.name || ""),
    sortOrder: String(item?.sortOrder ?? 0),
    isActive: Boolean(item?.isActive)
  });

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

  return (
    <section id="financeSettingsPanel" className="all-users-panel settings-panel ops-panel-shell finance-panel-shell finance-settings-panel">
      <div className="all-users-head">
        <h3>{translate("Finance Settings")}</h3>
        <div className="all-users-head-actions">
          <CustomSelect
            value={status}
            options={statusOptions.map((option) => ({ ...option, label: translate(option.label) }))}
            onChange={setStatus}
          />
          <button type="button" className="header-btn panel-close-btn" aria-label={translate("Close finance settings panel")} onClick={onClose}>
            ×
          </button>
        </div>
      </div>

      <h4>{translate("Payment Methods")}</h4>
      <form className="settings-inline-form ops-inline-editor" onSubmit={submitForm}>
        <input
          type="text"
          maxLength={96}
          value={form.name}
          placeholder={translate("Payment Method")}
          onChange={(event) => setForm((current) => ({ ...current, name: event.currentTarget.value }))}
        />
        <input
          type="number"
          value={form.sortOrder}
          placeholder={translate("Sort Order")}
          onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.currentTarget.value }))}
        />
        <label className="settings-checkbox settings-checkbox-inline">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) => setForm((current) => ({ ...current, isActive: event.currentTarget.checked }))}
          />
          {translate("Active")}
        </label>
        <button type="submit" className="table-action-btn" disabled={submitting}>
          {submitting ? "..." : translate(isEditing ? "Save" : "Create")}
        </button>
        {isEditing ? (
          <button type="button" className="table-action-btn" onClick={resetForm}>{translate("Cancel")}</button>
        ) : null}
      </form>

      <p className="all-users-state" hidden={!message}>{translate(message)}</p>

      <div className="all-users-table-wrap settings-table-wrap" hidden={items.length === 0}>
        <table className="all-users-table settings-table" aria-label={translate("Payment methods table")}>
          <thead>
            <tr>
              <th>ID</th>
              <th>{translate("Payment Method")}</th>
              <th>{translate("Sort Order")}</th>
              <th>{translate("Active")}</th>
              <th>{translate("Created")}</th>
              <th>{translate("Edit")}</th>
              <th>{translate("Delete")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={String(item.id)}>
                <td>{item.id}</td>
                <td>{item.name || "-"}</td>
                <td>{item.sortOrder ?? 0}</td>
                <td>{translate(item.isActive ? "Yes" : "No")}</td>
                <td>{formatDateYMD(item.createdAt)}</td>
                <td>
                  <button type="button" className="table-action-btn" hidden={!canUpdateSettingsFinance} onClick={() => startEdit(item)}>
                    {translate("Edit")}
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    className="table-action-btn table-action-btn-danger"
                    hidden={!canDeleteSettingsFinance}
                    disabled={deletingId === String(item.id) || !item.isActive}
                    onClick={() => deactivate(item)}
                  >
                    {deletingId === String(item.id) ? "..." : translate("Delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default FinanceSettingsPanel;
