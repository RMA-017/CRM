import { useCallback, useEffect, useRef, useState } from "react";
import ActionIconButton from "../../../components/ActionIconButton.jsx";
import CompactDialog from "../../../components/CompactDialog.jsx";
import { useI18n } from "../../../i18n/I18nProvider.jsx";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";
import { isValidPhoneInput } from "../../../lib/phone-number.js";
import "../../../css/components/internal-lessons.css";

const TEXT = {
  uz: {
    title: "Tarbiyachilar", add: "Bola qo‘shish", child: "Bola", name: "Tarbiyachi", phone: "Telefon", edit: "Tahrirlash", remove: "O‘chirish",
    search: "Qidirish", searchHint: "Bola, tarbiyachi yoki telefon", childSearch: "Bolani ismi yoki ID orqali qidirish", save: "Saqlash", cancel: "Bekor qilish", close: "Yopish",
    empty: "Ro‘yxat bo‘sh.", loading: "Yuklanmoqda...", previous: "Oldingi", next: "Keyingi", noChildren: "Qo‘shilmagan bolalar topilmadi.",
    shared: "Bir xil telefon — bitta tarbiyachi. Uning ismi o‘zgarsa, shu telefonli barcha qatorlarda yangilanadi. Telefon o‘zgarsa, faqat shu bola qayta biriktiriladi.",
    existing: "Bu telefon bilan tarbiyachi mavjud. Ismi avtomatik to‘ldirildi.", unassigned: "Biriktirilmagan",
    confirmDelete: "Bola maktab-bog‘cha ro‘yxatidan chiqariladi va uning ichki dars jadvali o‘chadi. Asosiy mijoz, terapiya, jurnal tarixi va boshqa bolalar saqlanadi.",
    failure: "Amalni bajarib bo‘lmadi.", errors: { INVALID_NAME: "Tarbiyachining ismini kiriting.", INVALID_PHONE: "Telefon raqamini to‘g‘ri kiriting.",
      INVALID_CLIENTS: "Bazadan bolani tanlang.", ALREADY_ENROLLED: "Bola bu ro‘yxatga allaqachon qo‘shilgan.", NOT_FOUND: "Qator topilmadi. Ro‘yxatni yangilang.", MIGRATION_REQUIRED: "Ma’lumotlar bazasi migratsiyasini bajarish kerak." }
  },
  ru: {
    title: "Воспитатели", add: "Добавить ребёнка", child: "Ребёнок", name: "Воспитатель", phone: "Телефон", edit: "Редактировать", remove: "Удалить",
    search: "Поиск", searchHint: "Ребёнок, воспитатель или телефон", childSearch: "Поиск ребёнка по имени или ID", save: "Сохранить", cancel: "Отмена", close: "Закрыть",
    empty: "Список пуст.", loading: "Загрузка...", previous: "Назад", next: "Далее", noChildren: "Не добавленные дети не найдены.",
    shared: "Одинаковый телефон — один воспитатель. Изменение имени обновит все строки с этим телефоном. Смена телефона изменит привязку только этого ребёнка.",
    existing: "Воспитатель с этим телефоном найден. Имя заполнено автоматически.", unassigned: "Не закреплён",
    confirmDelete: "Ребёнок будет исключён из списка школы-садика, его внутреннее расписание удалится. Основной клиент, терапия, история журнала и другие дети сохранятся.",
    failure: "Не удалось выполнить действие.", errors: { INVALID_NAME: "Введите имя воспитателя.", INVALID_PHONE: "Введите корректный телефон.",
      INVALID_CLIENTS: "Выберите ребёнка из базы.", ALREADY_ENROLLED: "Ребёнок уже добавлен в этот список.", NOT_FOUND: "Строка не найдена. Обновите список.", MIGRATION_REQUIRED: "Необходимо выполнить миграцию базы данных." }
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
  const [items, setItems] = useState([]), [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [query, setQuery] = useState(""), [search, setSearch] = useState(""), [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [revision, setRevision] = useState(0);
  const [form, setForm] = useState(null), [saving, setSaving] = useState(false), [deleteItem, setDeleteItem] = useState(null);
  const [clientSearch, setClientSearch] = useState(""), [clientPage, setClientPage] = useState(1);
  const [clientResult, setClientResult] = useState({ items: [], hasNext: false }), [clientsLoading, setClientsLoading] = useState(false);
  const [clientError, setClientError] = useState("");
  const busy = useRef(false);
  const errorText = useCallback((message) => ui.errors[message] || ui.failure, [ui]);

  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    request(`/?${new URLSearchParams({ q: search, page: String(page) })}`, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) { setItems(data.items); setPagination(data.pagination); } })
      .catch((err) => { if (!controller.signal.aborted) setError(errorText(err.message)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [search, page, revision, errorText]);

  const creating = Boolean(form && !form.id);
  const canSearchClients = clientSearch.trim().length >= 3;
  useEffect(() => {
    setClientResult({ items: [], hasNext: false });
    setClientError("");
    if (!creating || !canSearchClients) { setClientsLoading(false); return; }
    const controller = new AbortController(); setClientsLoading(true); setClientError("");
    const timer = setTimeout(() => {
      request(`/clients?${new URLSearchParams({ q: clientSearch.trim(), page: String(clientPage) })}`, { signal: controller.signal })
        .then((data) => { if (!controller.signal.aborted) setClientResult(data); })
        .catch((err) => { if (!controller.signal.aborted) setClientError(errorText(err.message)); })
        .finally(() => { if (!controller.signal.aborted) setClientsLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [creating, canSearchClients, clientSearch, clientPage, errorText]);

  const phone = form?.phone || "";
  const originalPhone = form?.originalPhone || "";
  useEffect(() => {
    if (!isValidPhoneInput(phone) || phone === originalPhone) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      request(`/by-phone?phone=${encodeURIComponent(phone)}`, { signal: controller.signal })
        .then(({ item }) => { if (!controller.signal.aborted && item) setForm((current) => current?.phone === phone ? { ...current, fullName: item.fullName } : current); })
        .catch(() => {});
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [phone, originalPhone]);

  function openForm(item = null) {
    setError(""); setDeleteItem(null); setClientSearch(""); setClientPage(1); setClientResult({ items: [], hasNext: false });
    setForm(item ? { ...item, originalPhone: item.phone } : { clientId: "", clientName: "", fullName: "", phone: "" });
  }
  async function save(event) {
    event.preventDefault(); if (busy.current) return;
    if (!form.id && !form.clientId) { setError(ui.errors.INVALID_CLIENTS); return; }
    busy.current = true; setSaving(true); setError("");
    try {
      const body = { fullName: form.fullName, phone: form.phone };
      if (!form.id) body.clientId = Number(form.clientId);
      await request(form.id ? `/${form.id}` : "/", { method: form.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setForm(null); setRevision((value) => value + 1);
    } catch (err) { setError(errorText(err.message)); }
    finally { setSaving(false); busy.current = false; }
  }
  async function remove() {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError("");
    try { await request(`/${deleteItem.id}`, { method: "DELETE" }); setDeleteItem(null); setRevision((value) => value + 1); }
    catch (err) { setError(errorText(err.message)); }
    finally { setSaving(false); busy.current = false; }
  }

  return <section className="all-users-panel crm-compact-panel" id="caregiversPanel">
    <div className="all-users-head"><h3>{ui.title}</h3><div className="all-users-head-actions">
      <form className="panel-search-bar caregiver-header-search" onSubmit={(e) => { e.preventDefault(); setSearch(query); setPage(1); setRevision((v) => v + 1); }}>
        <input className="panel-search-input" type="search" aria-label={ui.searchHint} placeholder={ui.searchHint} value={query} onChange={(e) => setQuery(e.target.value)} />
        <ActionIconButton className="btn" type="submit" disabled={loading} label={ui.search} icon="search" />
      </form>
      <ActionIconButton className="btn" hidden={!canCreateUsers} disabled={saving} onClick={() => openForm()} label={ui.add} icon="add" />
      <ActionIconButton className="header-btn panel-close-btn" disabled={saving} onClick={onClose} label={ui.close} icon="close" />
    </div></div>
    {error && !form && !deleteItem && <p role="alert" className="internal-lesson-error">{error}</p>}
    {form && <CompactDialog title={form.id ? ui.edit : ui.add} closeLabel={ui.close} busy={saving} onClose={() => { setForm(null); setError(""); }}>
      <form className="caregiver-editor" onSubmit={save}>
        {error && <p role="alert" className="internal-lesson-error">{error}</p>}
        {form.id ? <div className="caregiver-fixed-child"><small>{ui.child}</small><strong>{form.clientName} (#{form.clientId})</strong></div> : <fieldset className="caregiver-assignment" disabled={saving}>
          <legend>{ui.child}</legend>
          <input type="search" aria-label={ui.childSearch} placeholder={ui.childSearch} value={clientSearch} onChange={(e) => { setClientSearch(e.target.value); setClientPage(1); }} />
          {clientError && <p role="alert" className="internal-lesson-error">{clientError}</p>}
          {canSearchClients && <div className="caregiver-child-options">{clientsLoading ? <p>{ui.loading}</p> : clientResult.items.length === 0 ? <p>{ui.noChildren}</p> : clientResult.items.map((client) => <label key={client.id}>
            <input type="radio" name="caregiverChild" checked={Number(form.clientId) === client.id} onChange={() => setForm({ ...form, clientId: client.id, clientName: client.name })} />{client.name} (#{client.id})
          </label>)}</div>}
          {canSearchClients && clientResult.items.length > 0 && <div className="all-users-pagination"><ActionIconButton disabled={clientsLoading || clientPage <= 1} onClick={() => setClientPage((p) => p - 1)} label={ui.previous} icon="previous" /><span>{clientPage}</span><ActionIconButton disabled={clientsLoading || !clientResult.hasNext} onClick={() => setClientPage((p) => p + 1)} label={ui.next} icon="next" /></div>}
        </fieldset>}
        <div className="caregiver-identity-fields caregiver-roster-fields">
          <label className="field">{ui.phone}<input type="tel" maxLength={40} placeholder="+998" value={form.phone} disabled={saving} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label className="field">{ui.name}<input required={Boolean(form.phone.trim())} maxLength={255} value={form.fullName} disabled={saving} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></label>
        </div>
        <div className="internal-lesson-editor-actions"><ActionIconButton type="submit" className="btn" disabled={saving} label={ui.save} icon="save" /></div>
      </form>
    </CompactDialog>}
    {deleteItem && <CompactDialog title={ui.remove} closeLabel={ui.cancel} busy={saving} onClose={() => { setDeleteItem(null); setError(""); }}>
      <strong>{deleteItem.clientName}</strong><p>{ui.confirmDelete}</p>
      {error && <p role="alert" className="internal-lesson-error">{error}</p>}
      <div className="internal-lesson-editor-actions"><ActionIconButton className="btn" disabled={saving} onClick={remove} label={ui.remove} icon="remove" /></div>
    </CompactDialog>}
    {loading ? <p role="status">{ui.loading}</p> : <>
      <div className="all-users-table-wrap"><table className="all-users-table">
        <colgroup><col className="caregiver-col-id" /><col className="caregiver-col-children" /><col className="caregiver-col-name" /><col className="caregiver-col-phone" /><col className="caregiver-col-action" /><col className="caregiver-col-action" /></colgroup>
        <thead><tr><th>ID</th><th>{ui.child}</th><th>{ui.name}</th><th>{ui.phone}</th><th>{ui.edit}</th><th>{ui.remove}</th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.id}><td>{item.clientId}</td><td>{item.clientName}</td><td>{item.fullName || ui.unassigned}</td><td>{item.phone || "—"}</td>
          <td><ActionIconButton disabled={!canUpdateUsers || saving} onClick={() => openForm(item)} label={ui.edit} icon="edit" /></td>
          <td><ActionIconButton disabled={!canDeleteUsers || saving} onClick={() => { setError(""); setDeleteItem(item); }} label={ui.remove} icon="remove" /></td>
        </tr>)}</tbody>
      </table></div>
      {items.length === 0 && !error && <p className="all-users-state">{ui.empty}</p>}
      <div className="all-users-pagination"><ActionIconButton disabled={pagination.page <= 1} onClick={() => setPage(pagination.page - 1)} label={ui.previous} icon="previous" /><span>{pagination.page} / {pagination.totalPages}</span><ActionIconButton disabled={pagination.page >= pagination.totalPages} onClick={() => setPage(pagination.page + 1)} label={ui.next} icon="next" /></div>
    </>}
  </section>;
}
