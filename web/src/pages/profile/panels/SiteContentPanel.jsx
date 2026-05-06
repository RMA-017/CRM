import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import {
  createSiteContent,
  deleteSiteContent,
  emptySiteContentGroups,
  fetchManagedSiteContent,
  updateSiteContent
} from "../../../lib/site-content.js";

const SECTIONS = Object.freeze([
  {
    key: "kids",
    title: "Children's Creativity",
    imageLabel: "Image",
    fields: [
      { key: "authorUz", label: "Author (Uzbek)", placeholder: "Masalan: Ali" },
      { key: "authorRu", label: "Author (Russian)", placeholder: "Например: Али" },
      { key: "descriptionUz", label: "Description (Uzbek)", placeholder: "Ijod haqida qisqa yozing", type: "textarea" },
      { key: "descriptionRu", label: "Description (Russian)", placeholder: "Кратко опишите работу", type: "textarea" }
    ]
  },
  {
    key: "team",
    title: "Our Specialists",
    imageLabel: "Image",
    fields: [
      { key: "nameUz", label: "Name (Uzbek)", placeholder: "Mutaxassis ismi" },
      { key: "nameRu", label: "Name (Russian)", placeholder: "Имя специалиста" },
      { key: "roleUz", label: "Role (Uzbek)", placeholder: "Masalan: Logoped" },
      { key: "roleRu", label: "Role (Russian)", placeholder: "Например: Логопед" },
      { key: "descriptionUz", label: "Description (Uzbek)", placeholder: "Tajriba yoki yo'nalish", type: "textarea" },
      { key: "descriptionRu", label: "Description (Russian)", placeholder: "Опыт или направление", type: "textarea" }
    ]
  },
  {
    key: "partners",
    title: "Partners",
    imageLabel: "Logo",
    fields: [
      { key: "nameUz", label: "Name (Uzbek)", placeholder: "Hamkor nomi" },
      { key: "nameRu", label: "Name (Russian)", placeholder: "Название партнера" },
      { key: "descriptionUz", label: "Description (Uzbek)", placeholder: "Hamkor haqida qisqa yozing", type: "textarea" },
      { key: "descriptionRu", label: "Description (Russian)", placeholder: "Кратко опишите партнера", type: "textarea" }
    ]
  }
]);

const EMPTY_FORMS = Object.freeze({
  kids: { image: "", authorUz: "", authorRu: "", descriptionUz: "", descriptionRu: "" },
  team: { image: "", nameUz: "", nameRu: "", roleUz: "", roleRu: "", descriptionUz: "", descriptionRu: "" },
  partners: { image: "", nameUz: "", nameRu: "", descriptionUz: "", descriptionRu: "" }
});

const SECTION_KEYS = new Set(SECTIONS.map((section) => section.key));

function getSectionFromSearch(search) {
  const section = new URLSearchParams(search).get("section");
  return SECTION_KEYS.has(section) ? section : "kids";
}

const MAX_UPLOAD_IMAGE_SIDE = 1200;
const MAX_UPLOAD_IMAGE_BYTES = 650_000;

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function prepareImageDataUrl(file) {
  const originalDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(originalDataUrl);
  const width = Number(image.naturalWidth || image.width || 0);
  const height = Number(image.naturalHeight || image.height || 0);
  if (!width || !height) {
    return originalDataUrl;
  }

  const scale = Math.min(1, MAX_UPLOAD_IMAGE_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let quality = 0.82;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > MAX_UPLOAD_IMAGE_BYTES && quality > 0.42) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  return dataUrl;
}

function SiteContentPanel({
  onClose,
  canOpenSiteContent = false,
  canCreateSiteContent = false,
  canUpdateSiteContent = false,
  canDeleteSiteContent = false
}) {
  const location = useLocation();
  const [activeSectionKey, setActiveSectionKey] = useState(() => getSectionFromSearch(location.search));
  const [itemsBySection, setItemsBySection] = useState(emptySiteContentGroups);
  const [forms, setForms] = useState(EMPTY_FORMS);
  const [editing, setEditing] = useState({ sectionKey: "", id: "" });
  const [errors, setErrors] = useState({});
  const [panelMessage, setPanelMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [contentModalOpen, setContentModalOpen] = useState(false);

  const activeSection = useMemo(
    () => SECTIONS.find((section) => section.key === activeSectionKey) || SECTIONS[0],
    [activeSectionKey]
  );
  const activeItems = itemsBySection[activeSection.key] || [];
  const activeForm = forms[activeSection.key] || EMPTY_FORMS[activeSection.key];
  const editingThisSection = editing.sectionKey === activeSection.key && editing.id;

  useEffect(() => {
    let active = true;

    async function loadItems() {
      try {
        if (!canOpenSiteContent) {
          setPanelMessage("You do not have permission to view Website Management.");
          setIsLoading(false);
          return;
        }
        setIsLoading(true);
        setPanelMessage("");
        const items = await fetchManagedSiteContent();
        if (active) {
          setItemsBySection(items);
        }
      } catch (error) {
        if (active) {
          setPanelMessage(error?.message || "Failed to load content.");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadItems();
    return () => {
      active = false;
    };
  }, [canOpenSiteContent]);

  const replaceSectionItems = useCallback((sectionKey, nextItems) => {
    setItemsBySection((current) => ({
      ...current,
      [sectionKey]: nextItems
    }));
  }, []);

  const resetForm = useCallback((sectionKey = activeSection.key) => {
    setForms((current) => ({
      ...current,
      [sectionKey]: { ...EMPTY_FORMS[sectionKey] }
    }));
    setEditing({ sectionKey: "", id: "" });
    setErrors({});
  }, [activeSection.key]);

  useEffect(() => {
    const sectionKey = getSectionFromSearch(location.search);
    setActiveSectionKey(sectionKey);
    resetForm(sectionKey);
  }, [location.search, resetForm]);

  const updateField = useCallback((fieldKey, value) => {
    setForms((current) => ({
      ...current,
      [activeSection.key]: {
        ...current[activeSection.key],
        [fieldKey]: value
      }
    }));
    setErrors((current) => ({ ...current, [fieldKey]: "" }));
  }, [activeSection.key]);

  const handleImageChange = useCallback(async (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      return;
    }
    try {
      const dataUrl = await prepareImageDataUrl(file);
      if (dataUrl.length > MAX_UPLOAD_IMAGE_BYTES) {
        setErrors((current) => ({
          ...current,
          image: "Image is too large. Please choose a smaller file."
        }));
        return;
      }
      updateField("image", dataUrl);
    } catch {
      setErrors((current) => ({
        ...current,
        image: "Failed to load image."
      }));
    }
  }, [updateField]);

  const validateForm = useCallback(() => {
    const nextErrors = {};
    if (!activeForm.image) {
      nextErrors.image = `${activeSection.imageLabel} is required.`;
    }
    activeSection.fields.forEach((field) => {
      if (!String(activeForm[field.key] || "").trim()) {
        nextErrors[field.key] = `${field.label} is required.`;
      }
    });
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [activeForm, activeSection]);

  const handleSubmit = useCallback((event) => {
    event.preventDefault();
    if (editingThisSection ? !canUpdateSiteContent : !canCreateSiteContent) {
      setPanelMessage("You do not have permission to save website content.");
      return;
    }
    if (!validateForm()) {
      return;
    }
    const formElement = event.currentTarget;

    const payload = {
      ...activeForm,
      sectionKey: activeSection.key
    };

    async function save() {
      try {
        setIsSaving(true);
        setPanelMessage("");
        const savedItem = editingThisSection
          ? await updateSiteContent(editing.id, payload)
          : await createSiteContent(payload);
        if (!savedItem) {
          throw new Error("Failed to save content.");
        }

        const nextItems = editingThisSection
          ? activeItems.map((item) => (item.id === editing.id ? savedItem : item))
          : [savedItem, ...activeItems];
        replaceSectionItems(activeSection.key, nextItems);
        formElement.reset();
        resetForm(activeSection.key);
        setContentModalOpen(false);
      } catch (error) {
        const field = String(error?.field || "").trim();
        if (field) {
          setErrors((current) => ({ ...current, [field]: error?.message || "Error." }));
        }
        setPanelMessage(error?.message || "Failed to save content.");
      } finally {
        setIsSaving(false);
      }
    }

    void save();
  }, [
    activeForm,
    activeItems,
    activeSection,
    editing.id,
    editingThisSection,
    canCreateSiteContent,
    canUpdateSiteContent,
    replaceSectionItems,
    resetForm,
    validateForm
  ]);

  const startEdit = useCallback((item) => {
    if (!canUpdateSiteContent) {
      return;
    }
    setForms((current) => ({
      ...current,
      [activeSection.key]: {
        ...EMPTY_FORMS[activeSection.key],
        ...item
      }
    }));
    setEditing({ sectionKey: activeSection.key, id: item.id });
    setErrors({});
    setContentModalOpen(true);
  }, [activeSection.key, canUpdateSiteContent]);

  const openCreateModal = useCallback(() => {
    if (!canCreateSiteContent) {
      return;
    }
    resetForm(activeSection.key);
    setContentModalOpen(true);
  }, [activeSection.key, canCreateSiteContent, resetForm]);

  const closeContentModal = useCallback(() => {
    setContentModalOpen(false);
    resetForm(activeSection.key);
  }, [activeSection.key, resetForm]);

  const deleteItem = useCallback((itemId) => {
    if (!canDeleteSiteContent) {
      setPanelMessage("You do not have permission to delete website content.");
      return;
    }
    async function remove() {
      try {
        setDeletingId(itemId);
        setPanelMessage("");
        await deleteSiteContent(itemId);
        replaceSectionItems(
          activeSection.key,
          activeItems.filter((item) => item.id !== itemId)
        );
        if (editing.id === itemId) {
          resetForm(activeSection.key);
        }
      } catch (error) {
        setPanelMessage(error?.message || "Failed to delete content.");
      } finally {
        setDeletingId("");
      }
    }

    void remove();
  }, [activeItems, activeSection.key, canDeleteSiteContent, editing.id, replaceSectionItems, resetForm]);

  const contentForm = (
    <form className="site-content-form" onSubmit={handleSubmit} noValidate>
      <div className="site-content-card-head">
        <div>
          <h4>{activeSection.title}</h4>
        </div>
      </div>

      <label className={`site-content-image-field${activeForm.image ? " has-image" : ""}`}>
        <span>{activeSection.imageLabel}</span>
        {activeForm.image ? <img src={activeForm.image} alt="" aria-hidden="true" /> : null}
        <strong>{activeForm.image ? "File selected" : "Choose file"}</strong>
        <input type="file" accept="image/*" onChange={handleImageChange} />
        {errors.image ? <em>{errors.image}</em> : null}
      </label>

      <div className="site-content-field-grid">
        {activeSection.fields.map((field) => (
          <label key={field.key} className={`site-content-field${field.type === "textarea" ? " is-wide" : ""}`}>
            <span>{field.label}</span>
            {field.type === "textarea" ? (
              <textarea
                rows="4"
                value={activeForm[field.key] || ""}
                placeholder={field.placeholder}
                onInput={(event) => updateField(field.key, event.currentTarget.value)}
              />
            ) : (
              <input
                type="text"
                value={activeForm[field.key] || ""}
                placeholder={field.placeholder}
                onInput={(event) => updateField(field.key, event.currentTarget.value)}
              />
            )}
            {errors[field.key] ? <em>{errors[field.key]}</em> : null}
          </label>
        ))}
      </div>

      <div className="site-content-form-actions">
        <button type="submit" className="header-btn">
          {isSaving ? "Saving..." : (editingThisSection ? "Save" : "Add")}
        </button>
        <button type="button" className="header-btn ghost-btn" disabled={isSaving} onClick={closeContentModal}>
          Cancel
        </button>
      </div>
    </form>
  );

  const contentModal = (
    <>
      <section
        id="siteContentCreateModal"
        className="logout-confirm-modal site-content-modal"
        hidden={!contentModalOpen}
      >
        <div className="all-users-head">
          <h3>{editingThisSection ? "Edit Content" : "New Content"}</h3>
          <button
            id="closeSiteContentCreateModalBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close content modal"
            onClick={closeContentModal}
          >
            ×
          </button>
        </div>
        {contentForm}
      </section>
      <div className="login-overlay" hidden={!contentModalOpen} onClick={closeContentModal} />
    </>
  );

  return (
    <section id="siteContentPanel" className="all-users-panel site-content-panel">
      <div className="site-content-panel-head">
        <div className="all-users-head">
          <h3>Website Management</h3>
          <div className="all-users-head-actions">
            <button
              id="openSiteContentCreateModalBtn"
              type="button"
              className="header-btn appointment-breaks-add-icon-btn"
              aria-label={`Add ${activeSection.title}`}
              title={`Add ${activeSection.title}`}
              hidden={!canCreateSiteContent}
              onClick={openCreateModal}
            >
              +
            </button>
            <button
              id="closeSiteContentBtn"
              type="button"
              className="header-btn panel-close-btn"
              aria-label="Close site content panel"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </div>
      </div>

      {panelMessage ? (
        <div className="site-content-panel-message">
          <p className="all-users-state">{panelMessage}</p>
        </div>
      ) : null}

      <div className="site-content-panel-main">
        <div className="site-content-workspace">
          <div className="site-content-list-panel">
            <div className="site-content-card-head">
              <div>
                <h4>{activeSection.title}</h4>
              </div>
              <strong>{activeItems.length}</strong>
            </div>

            <div className="site-content-list">
              {isLoading ? (
                <p className="all-users-state">Loading...</p>
              ) : activeItems.length === 0 ? (
                <p className="all-users-state">No content yet.</p>
              ) : activeItems.map((item) => (
                <article key={item.id} className="site-content-item">
                  <img src={item.image} alt="" aria-hidden="true" />
                  <div>
                    <h4>{item.authorUz || item.author || item.nameUz || item.name}</h4>
                  </div>
                  <div className="site-content-item-actions">
                    <button
                      type="button"
                      className="table-action-btn"
                      hidden={!canUpdateSiteContent}
                      onClick={() => startEdit(item)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="table-action-btn table-action-btn-danger"
                      hidden={!canDeleteSiteContent}
                      disabled={deletingId === item.id}
                      onClick={() => deleteItem(item.id)}
                    >
                      {deletingId === item.id ? "..." : "Delete"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
      {typeof document !== "undefined" ? createPortal(contentModal, document.body) : contentModal}
    </section>
  );
}

export default SiteContentPanel;
