import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

function CustomSelect({
  value,
  options,
  placeholder,
  onChange,
  id,
  error = false,
  disabled = false,
  forceOpenDown = false,
  forceOpenUp = false,
  menuPortal = false,
  maxVisibleOptions = null,
  searchable = false,
  searchPlaceholder = "Search...",
  searchThreshold = 0
}) {
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [menuMaxHeight, setMenuMaxHeight] = useState("");
  const [menuPortalStyle, setMenuPortalStyle] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedOptions = Array.isArray(options) ? options : [];

  const optionLabelByValue = useMemo(() => {
    const map = new Map();
    normalizedOptions.forEach((option) => {
      map.set(option.value, option.label);
    });
    return map;
  }, [normalizedOptions]);

  const normalizedSearchThreshold = Number.isInteger(searchThreshold) && searchThreshold > 0
    ? searchThreshold
    : 0;
  const shouldShowSearch = searchable && normalizedOptions.length >= normalizedSearchThreshold;
  const filteredOptions = useMemo(() => {
    if (!shouldShowSearch) {
      return normalizedOptions;
    }

    const query = String(searchQuery || "").trim().toLowerCase();
    if (!query) {
      return normalizedOptions;
    }

    return normalizedOptions.filter((option) => String(option?.label || "").toLowerCase().includes(query));
  }, [normalizedOptions, searchQuery, shouldShowSearch]);

  const selectedLabel = useMemo(() => {
    return optionLabelByValue.get(value) || placeholder;
  }, [optionLabelByValue, placeholder, value]);

  useEffect(() => {
    if (!open || !triggerRef.current) {
      setOpenUp(false);
      setMenuMaxHeight("");
      setMenuPortalStyle(null);
      return undefined;
    }

    const updateLayout = () => {
      if (!triggerRef.current) {
        return;
      }

      const triggerRect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - triggerRect.bottom - 12;
      const spaceAbove = triggerRect.top - 12;
      const normalizedMaxVisibleOptions = Number.isInteger(maxVisibleOptions) && maxVisibleOptions > 0
        ? maxVisibleOptions
        : null;
      const visibleOptionsCount = normalizedMaxVisibleOptions
        ? Math.max(1, Math.min(filteredOptions.length, normalizedMaxVisibleOptions))
        : null;
      const desiredMenuHeight = visibleOptionsCount
        ? ((visibleOptionsCount * 40) + 8)
        : 184;
      const shouldOpenUp = forceOpenDown
        ? false
        : (forceOpenUp
          ? true
          : (spaceBelow < desiredMenuHeight && spaceAbove > spaceBelow));
      const availableSpace = shouldOpenUp ? spaceAbove : spaceBelow;
      const calculatedMaxHeight = Math.max(120, Math.min(desiredMenuHeight, availableSpace - 8));

      setOpenUp(shouldOpenUp);
      setMenuMaxHeight(`${calculatedMaxHeight}px`);

      if (menuPortal) {
        const preferredTop = shouldOpenUp
          ? (triggerRect.top - calculatedMaxHeight - 6)
          : (triggerRect.bottom + 6);
        const normalizedTop = Math.max(8, Math.min(preferredTop, window.innerHeight - calculatedMaxHeight - 8));
        const normalizedLeft = Math.max(8, Math.min(triggerRect.left, window.innerWidth - triggerRect.width - 8));
        setMenuPortalStyle({
          position: "fixed",
          top: `${normalizedTop}px`,
          left: `${normalizedLeft}px`,
          width: `${Math.max(120, triggerRect.width)}px`,
          maxHeight: `${calculatedMaxHeight}px`
        });
      } else {
        setMenuPortalStyle(null);
      }
    };

    updateLayout();

    if (!menuPortal) {
      return undefined;
    }

    window.addEventListener("resize", updateLayout);
    window.addEventListener("scroll", updateLayout, true);
    return () => {
      window.removeEventListener("resize", updateLayout);
      window.removeEventListener("scroll", updateLayout, true);
    };
  }, [filteredOptions.length, forceOpenDown, forceOpenUp, maxVisibleOptions, menuPortal, open]);

  useEffect(() => {
    if (!open && searchQuery) {
      setSearchQuery("");
    }
  }, [open, searchQuery]);

  useEffect(() => {
    if (disabled && open) {
      setOpen(false);
    }
  }, [disabled, open]);

  useEffect(() => {
    function handleOutside(event) {
      if (!wrapRef.current) {
        return;
      }
      const clickedInsideTrigger = wrapRef.current.contains(event.target);
      const clickedInsideMenu = Boolean(menuPortal && menuRef.current && menuRef.current.contains(event.target));
      if (!clickedInsideTrigger && !clickedInsideMenu) {
        setOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const menuElement = (
    <div
      ref={menuRef}
      className="custom-select-menu"
      role="listbox"
      hidden={!open}
      style={menuPortal
        ? (menuPortalStyle || { position: "fixed", top: "-9999px", left: "-9999px", width: "0px", maxHeight: "0px" })
        : (menuMaxHeight ? { maxHeight: menuMaxHeight } : undefined)}
      onWheel={(event) => {
        event.stopPropagation();
      }}
      onTouchMove={(event) => {
        event.stopPropagation();
      }}
    >
      {open && shouldShowSearch ? (
        <div className="custom-select-search-wrap">
          <input
            type="text"
            className="custom-select-search-input"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
            onMouseDown={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
      {open ? (
        filteredOptions.length > 0 ? (
          filteredOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className="custom-select-option"
              aria-selected={option.value === value ? "true" : "false"}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))
        ) : (
          <div className="custom-select-empty">No options found.</div>
        )
      ) : null}
    </div>
  );

  return (
    <div ref={wrapRef} id={id} className={`custom-select${openUp ? " open-up" : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`custom-select-trigger${error ? " input-error" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open ? "true" : "false"}
        disabled={disabled}
        onClick={() => {
          if (disabled) {
            return;
          }
          setOpen((prev) => !prev);
        }}
      >
        <span>{selectedLabel}</span>
      </button>

      {menuPortal && typeof document !== "undefined"
        ? createPortal(menuElement, document.body)
        : menuElement}
    </div>
  );
}

export default CustomSelect;
