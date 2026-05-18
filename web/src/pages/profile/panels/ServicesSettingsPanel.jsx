import { useCallback, useEffect, useMemo, useState } from "react";
import CustomSelect from "../../../components/CustomSelect.jsx";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";
import { useI18n } from "../../../i18n/I18nProvider.jsx";

const EMPTY_FORM = Object.freeze({
  id: "",
  positionId: "",
  name: "",
  priceUzs: "",
  isActive: true
});

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
  const [status, setStatus] = useState("active");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [servicesResponse, positionsResponse] = await Promise.all([
        apiFetch(`/api/settings/services?status=${encodeURIComponent(status)}`),
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
  }, [status, translate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const positionOptions = useMemo(() => (
    positions
      .filter((item) => item?.isActive || String(item?.id) === String(form.positionId))
      .map((item) => ({ value: String(item.id), label: String(item.label || "").trim() || `#${item.id}` }))
  ), [form.positionId, positions]);

  const statusOptions = useMemo(() => [
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
    { value: "all", label: "All" }
  ], []);

  const resetForm = () => setForm(EMPTY_FORM);
  const isEditing = Boolean(form.id);

  const submitForm = async (event) => {
    event.preventDefault();
    if (submitting || (isEditing ? !canUpdateSettingsServices : !canCreateSettingsServices)) return;
    setSubmitting(true);
    try {
      const payload = {
        positionId: form.positionId,
        name: form.name.trim(),
        priceUzs: form.priceUzs === "" ? 0 : form.priceUzs,
        isActive: form.isActive
      };
      const response = await apiFetch(isEditing ? `/api/settings/services/${form.id}` : "/api/settings/services", {
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
      await loadData();
    } catch {
      window.alert?.(translate("Service save failed."));
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (item) => setForm({
    id: String(item?.id || ""),
    positionId: String(item?.positionId || ""),
    name: String(item?.name || ""),
    priceUzs: String(item?.priceUzs ?? 0),
    isActive: Boolean(item?.isActive)
  });

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

  return (
    <section id="servicesSettingsPanel" className="all-users-panel settings-panel">
      <div className="all-users-head">
        <h3>Service Settings</h3>
        <div className="all-users-head-actions">
          <CustomSelect value={status} options={statusOptions} onChange={setStatus} />
          <button type="button" className="header-btn panel-close-btn" aria-label="Close service settings panel" onClick={onClose}>
            ×
          </button>
        </div>
      </div>

      <form className="settings-inline-form" onSubmit={submitForm}>
        <CustomSelect
          value={form.positionId}
          options={positionOptions}
          placeholder="Position"
          searchable
          searchThreshold={1}
          onChange={(value) => setForm((current) => ({ ...current, positionId: value }))}
        />
        <input
          type="text"
          maxLength={128}
          value={form.name}
          placeholder="Service Name"
          onChange={(event) => setForm((current) => ({ ...current, name: event.currentTarget.value }))}
        />
        <input
          type="number"
          min="0"
          value={form.priceUzs}
          placeholder="Price"
          onChange={(event) => setForm((current) => ({ ...current, priceUzs: event.currentTarget.value }))}
        />
        <label className="settings-checkbox settings-checkbox-inline">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) => setForm((current) => ({ ...current, isActive: event.currentTarget.checked }))}
          />
          Active
        </label>
        <button type="submit" className="table-action-btn" disabled={submitting}>
          {submitting ? "..." : (isEditing ? "Save" : "Create")}
        </button>
        {isEditing ? (
          <button type="button" className="table-action-btn" onClick={resetForm}>Cancel</button>
        ) : null}
      </form>

      <p className="all-users-state" hidden={!message}>{message}</p>

      <div className="all-users-table-wrap settings-table-wrap" hidden={items.length === 0}>
        <table className="all-users-table settings-table" aria-label="Service settings table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Position</th>
              <th>Service Name</th>
              <th>Price</th>
              <th>Active</th>
              <th>Edit</th>
              <th>Delete</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={String(item.id)}>
                <td>{item.id}</td>
                <td>{item.positionLabel || "-"}</td>
                <td>{item.name || "-"}</td>
                <td>{formatPrice(item.priceUzs)}</td>
                <td>{item.isActive ? "Yes" : "No"}</td>
                <td>
                  <button type="button" className="table-action-btn" hidden={!canUpdateSettingsServices} onClick={() => startEdit(item)}>
                    Edit
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    className="table-action-btn table-action-btn-danger"
                    hidden={!canDeleteSettingsServices}
                    disabled={deletingId === String(item.id) || !item.isActive}
                    onClick={() => deactivate(item)}
                  >
                    {deletingId === String(item.id) ? "..." : "Delete"}
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

export default ServicesSettingsPanel;
