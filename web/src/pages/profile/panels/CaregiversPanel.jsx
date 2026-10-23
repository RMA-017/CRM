import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../../../i18n/I18nProvider.jsx";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";

const TEXT = {
  uz: {
    title: "Tarbiyachilar", add: "Tarbiyachi qo‘shish", name: "Ism-familiya", phone: "Telefon",
    children: "Biriktirilgan bolalar", active: "Faol", edit: "Tahrirlash", remove: "O‘chirish",
    search: "Qidirish", searchHint: "Ism yoki telefon", childSearch: "Bolani ismi yoki ID orqali qidirish",
    save: "Saqlash", cancel: "Bekor qilish", close: "Yopish", empty: "Tarbiyachilar topilmadi.",
    loading: "Yuklanmoqda...", previous: "Oldingi", next: "Keyingi", yes: "Ha", no: "Yo‘q",
    confirmDelete: "Tarbiyachini va unga biriktirishlarni o‘chirasizmi? Bolalar tizimda qoladi.",
    failure: "Amalni bajarib bo‘lmadi.", noChildren: "Bolalar topilmadi.",
    errors: { PHONE_EXISTS: "Bu telefon bilan tarbiyachi allaqachon mavjud.", INVALID_NAME: "Ism-familiyani kiriting.",
      INVALID_PHONE: "Telefon raqamini to‘g‘ri kiriting.", INVALID_CLIENTS: "Bolalar ro‘yxati o‘zgargan. Qayta tanlang.",
      MIGRATION_REQUIRED: "Ma’lumotlar bazasi migratsiyasini bajarish kerak.", NOT_FOUND: "Tarbiyachi topilmadi." }
  },
  ru: {
    title: "Воспитатели", add: "Добавить воспитателя", name: "ФИО", phone: "Телефон",
    children: "Закреплённые дети", active: "Активен", edit: "Редактировать", remove: "Удалить",
    search: "Поиск", searchHint: "Имя или телефон", childSearch: "Поиск ребёнка по имени или ID",
    save: "Сохранить", cancel: "Отмена", close: "Закрыть", empty: "Воспитатели не найдены.",
    loading: "Загрузка...", previous: "Назад", next: "Далее", yes: "Да", no: "Нет",
    confirmDelete: "Удалить воспитателя и закрепления детей? Дети останутся в системе.",
    failure: "Не удалось выполнить действие.", noChildren: "Дети не найдены.",
    errors: { PHONE_EXISTS: "Воспитатель с этим телефоном уже существует.", INVALID_NAME: "Введите ФИО.",
      INVALID_PHONE: "Введите корректный номер телефона.", INVALID_CLIENTS: "Список детей изменился. Выберите заново.",
      MIGRATION_REQUIRED: "Необходимо выполнить миграцию базы данных.", NOT_FOUND: "Воспитатель не найден." }
  }
};

async function request(path, options) {
  const response = await apiFetch(`/api/users/caregivers${path}`, options);
  const data = await readApiResponseData(response);
  if (!response.ok) throw new Error(data?.message || "Request failed");
  return data;
}

export default function CaregiversPanel({ canCreateUsers, canUpdateUsers, canDeleteUsers, onClose }) {
  const { language } = useI18n();
  const ui = TEXT[language] || TEXT.uz;
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [clientSearch, setClientSearch] = useState("");
  const [clientPage, setClientPage] = useState(1);
  const [clientResult, setClientResult] = useState({ items: [], hasNext: false });
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientError, setClientError] = useState("");
  const [deleteItem, setDeleteItem] = useState(null);
  const busy = useRef(false);
  const errorText = useCallback((message) => ui.errors[message] || ui.failure, [ui]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ q: search, page: String(page) });
    request(`/?${params}`, { signal: controller.signal })
      .then((data) => { setItems(data.items); setPagination(data.pagination); })
      .catch((err) => { if (!controller.signal.aborted) setError(errorText(err.message)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [search, page, revision, errorText]);

  const editing = form !== null;
  useEffect(() => {
    if (!editing) return;
    const controller = new AbortController();
    setClientsLoading(true);
    setClientError("");
    setClientResult({ items: [], hasNext: false });
    const timer = setTimeout(() => {
      request(`/clients?q=${encodeURIComponent(clientSearch)}&page=${clientPage}`, { signal: controller.signal })
        .then(setClientResult)
        .catch((err) => { if (!controller.signal.aborted) setClientError(errorText(err.message)); })
        .finally(() => { if (!controller.signal.aborted) setClientsLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [editing, clientSearch, clientPage, errorText]);

  function openForm(item = null) {
    setError("");
    setDeleteItem(null);
    setClientSearch("");
    setClientPage(1);
    setForm(item ? { ...item, clients: [...item.clients] } : { fullName: "", phone: "", isActive: true, clients: [] });
  }

  async function save(event) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      await request(form.id ? `/${form.id}` : "/", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: form.fullName, phone: form.phone, isActive: form.isActive, clientIds: form.clients.map((c) => Number(c.id)) })
      });
      setForm(null);
      setRevision((value) => value + 1);
    } catch (err) { setError(errorText(err.message)); }
    finally { setSaving(false); busy.current = false; }
  }

  async function remove() {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      await request(`/${deleteItem.id}`, { method: "DELETE" });
      setDeleteItem(null);
      setRevision((value) => value + 1);
    } catch (err) { setError(errorText(err.message)); }
    finally { setSaving(false); busy.current = false; }
  }

  return (
    <section className="all-users-panel" id="caregiversPanel">
      <div className="all-users-head">
        <h3>{ui.title}</h3>
        <div className="all-users-head-actions">
          <button type="button" className="btn" hidden={!canCreateUsers || editing} disabled={saving} onClick={() => openForm()}>{ui.add}</button>
          <button type="button" className="header-btn panel-close-btn" aria-label={ui.close} disabled={saving} onClick={onClose}>×</button>
        </div>
      </div>
      {error && <p role="alert" className="all-users-state">{error}</p>}
      {form ? (
        <form className="auth-form" onSubmit={save}>
          <h4>{form.id ? ui.edit : ui.add}</h4>
          <label className="field">{ui.name}<input required maxLength={255} value={form.fullName} disabled={saving}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></label>
          <label className="field">{ui.phone}<input required type="tel" maxLength={40} placeholder="+998" value={form.phone} disabled={saving}
            onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label><input type="checkbox" checked={form.isActive} disabled={saving}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> {ui.active}</label>
          <fieldset disabled={saving}>
            <legend>{ui.children} ({form.clients.length})</legend>
            {form.clients.map((client) => <div key={client.id}>
              {client.name} (#{client.id}) <button type="button" aria-label={`${ui.remove}: ${client.name}`}
                onClick={() => setForm({ ...form, clients: form.clients.filter((c) => c.id !== client.id) })}>×</button>
            </div>)}
            <input type="search" aria-label={ui.childSearch} placeholder={ui.childSearch} value={clientSearch}
              onChange={(e) => { setClientSearch(e.target.value); setClientPage(1); }} />
            {clientError && <p role="alert">{clientError}</p>}
            {clientsLoading ? <p>{ui.loading}</p> : clientResult.items.length === 0 ? <p>{ui.noChildren}</p> : clientResult.items.map((client) => (
              <label key={client.id} style={{ display: "block" }}>
                <input type="checkbox" checked={form.clients.some((c) => c.id === client.id)} onChange={(e) => {
                  setForm({ ...form, clients: e.target.checked
                    ? [...form.clients.filter((c) => c.id !== client.id), client]
                    : form.clients.filter((c) => c.id !== client.id) });
                }} /> {client.name} (#{client.id})
              </label>
            ))}
            <div className="all-users-pagination">
              <button type="button" disabled={clientsLoading || clientPage <= 1} onClick={() => setClientPage((p) => p - 1)}>{ui.previous}</button>
              <span>{clientPage}</span>
              <button type="button" disabled={clientsLoading || !clientResult.hasNext} onClick={() => setClientPage((p) => p + 1)}>{ui.next}</button>
            </div>
          </fieldset>
          <div className="all-users-head-actions">
            <button type="submit" className="btn" disabled={saving}>{saving ? ui.loading : ui.save}</button>
            <button type="button" className="header-btn" disabled={saving} onClick={() => { setForm(null); setError(""); }}>{ui.cancel}</button>
          </div>
        </form>
      ) : (
        <>
          <form className="panel-search-bar" onSubmit={(e) => { e.preventDefault(); setSearch(query); setPage(1); setRevision((v) => v + 1); }}>
            <input className="panel-search-input" type="search" aria-label={ui.searchHint} placeholder={ui.searchHint} value={query} onChange={(e) => setQuery(e.target.value)} />
            <button className="btn" type="submit" disabled={loading}>{ui.search}</button>
          </form>
          {deleteItem && <div role="alertdialog" aria-modal="false" aria-label={ui.remove}>
            <p>{deleteItem.fullName}: {ui.confirmDelete}</p>
            <button className="btn" type="button" disabled={saving} onClick={remove}>{ui.remove}</button>
            <button type="button" disabled={saving} onClick={() => setDeleteItem(null)}>{ui.cancel}</button>
          </div>}
          {loading ? <p>{ui.loading}</p> : <>
            <div className="all-users-table-wrap"><table className="all-users-table">
              <thead><tr><th>ID</th><th>{ui.name}</th><th>{ui.phone}</th><th>{ui.children}</th><th>{ui.active}</th><th>{ui.edit}</th><th>{ui.remove}</th></tr></thead>
              <tbody>{items.map((item) => <tr key={item.id}>
                <td>{item.id}</td><td>{item.fullName}</td><td>{item.phone}</td>
                <td>{item.clients.map((c) => `${c.name} (#${c.id})`).join(", ") || "—"}</td>
                <td>{item.isActive ? ui.yes : ui.no}</td>
                <td><button type="button" disabled={!canUpdateUsers || saving} onClick={() => { setDeleteItem(null); openForm(item); }}>{ui.edit}</button></td>
                <td><button type="button" disabled={!canDeleteUsers || saving} onClick={() => { setError(""); setDeleteItem(item); }}>{ui.remove}</button></td>
              </tr>)}</tbody>
            </table></div>
            {items.length === 0 && !error && <p>{ui.empty}</p>}
            <div className="all-users-pagination">
              <button type="button" disabled={pagination.page <= 1} onClick={() => setPage(pagination.page - 1)}>{ui.previous}</button>
              <span>{pagination.page} / {pagination.totalPages}</span>
              <button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage(pagination.page + 1)}>{ui.next}</button>
            </div>
          </>}
        </>
      )}
    </section>
  );
}
