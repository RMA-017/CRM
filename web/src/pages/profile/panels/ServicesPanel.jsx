import { useEffect, useMemo, useState } from "react";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";
import { useI18n } from "../../../i18n/I18nProvider.jsx";

function formatPrice(value) {
  const amount = Number.parseInt(String(value ?? 0), 10) || 0;
  return amount > 0 ? `${amount.toLocaleString("ru-RU")} UZS` : "-";
}

function ServicesPanel({ onClose }) {
  const { translate } = useI18n();
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await apiFetch("/api/services");
        const data = await readApiResponseData(response);
        if (!active) return;
        if (!response.ok) {
          const nextMessage = data?.message || "Failed to load services.";
          setMessage(nextMessage);
          window.alert?.(translate(nextMessage));
          return;
        }
        const nextItems = Array.isArray(data?.items) ? data.items : [];
        setItems(nextItems);
        setMessage(nextItems.length === 0 ? "No services found." : "");
      } catch {
        if (!active) return;
        setMessage("Failed to load services.");
        window.alert?.(translate("Failed to load services."));
      }
    })();
    return () => {
      active = false;
    };
  }, [translate]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => (
      String(item?.name || "").toLowerCase().includes(query)
      || String(item?.positionLabel || "").toLowerCase().includes(query)
    ));
  }, [items, search]);

  return (
    <section id="servicesPanel" className="all-users-panel settings-panel ops-panel-shell services-panel">
      <div className="all-users-head">
        <h3>{translate("Services")}</h3>
        <div className="all-users-head-actions">
          <input
            type="search"
            className="panel-search-input"
            value={search}
            aria-label={translate("Search")}
            placeholder={translate("Search...")}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
          <button type="button" className="header-btn panel-close-btn" aria-label={translate("Close services panel")} onClick={onClose}>
            ×
          </button>
        </div>
      </div>

      <p className="all-users-state" hidden={!message}>{translate(message)}</p>

      <div className="all-users-table-wrap settings-table-wrap" hidden={filteredItems.length === 0}>
        <table className="all-users-table settings-table services-table" aria-label={translate("Services table")}>
          <thead>
            <tr>
              <th>{translate("Position")}</th>
              <th>{translate("Service Name")}</th>
              <th>{translate("Price")}</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => (
              <tr key={String(item.id)}>
                <td>{item.positionLabel || "-"}</td>
                <td>{item.name || "-"}</td>
                <td>{formatPrice(item.priceUzs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default ServicesPanel;
