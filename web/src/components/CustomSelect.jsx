import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const CUSTOM_SELECT_OPTION_HEIGHT_PX = 30;
const CUSTOM_SELECT_MENU_GAP_PX = 2;
const CUSTOM_SELECT_MENU_PADDING_PX = 12;
const CUSTOM_SELECT_SEARCH_BLOCK_HEIGHT_PX = 36;

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
  menuAlign = "left",
  maxVisibleOptions = null,
  searchable = false,
  searchPlaceholder = "Search...",
  searchThreshold = 0,
  menuWidthScale = 1,
  menuHeightScale = 1,
  emptyText = "No options found.",
  onSearchChange = null
}) {
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [menuMaxHeight, setMenuMaxHeight] = useState("");
  const [menuPortalStyle, setMenuPortalStyle] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedOptions = useMemo(() => (
    Array.isArray(options)
      ? options.filter((option) => option && typeof option === "object" && "value" in option)
      : []
  ), [options]);

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
  const normalizedMenuWidthScale = Number.isFinite(menuWidthScale) && menuWidthScale > 0
    ? Math.max(0.5, Math.min(menuWidthScale, 2))
    : 1;
  const normalizedMenuHeightScale = Number.isFinite(menuHeightScale) && menuHeightScale > 0
    ? Math.max(0.5, Math.min(menuHeightScale, 2))
    : 1;
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
      const searchBlockHeight = shouldShowSearch ? CUSTOM_SELECT_SEARCH_BLOCK_HEIGHT_PX : 0;
      const desiredMenuHeight = visibleOptionsCount
        ? (
          (visibleOptionsCount * CUSTOM_SELECT_OPTION_HEIGHT_PX)
          + (Math.max(0, visibleOptionsCount - 1) * CUSTOM_SELECT_MENU_GAP_PX)
          + CUSTOM_SELECT_MENU_PADDING_PX
          + searchBlockHeight
        )
        : (
          CUSTOM_SELECT_OPTION_HEIGHT_PX
          + CUSTOM_SELECT_MENU_PADDING_PX
          + searchBlockHeight
        );
      const scaledDesiredMenuHeight = Math.max(96 + searchBlockHeight, Math.round(desiredMenuHeight * normalizedMenuHeightScale));
      const shouldOpenUp = forceOpenDown
        ? false
        : (forceOpenUp
          ? true
          : (spaceBelow < scaledDesiredMenuHeight && spaceAbove > spaceBelow));
      const availableSpace = shouldOpenUp ? spaceAbove : spaceBelow;
      const calculatedMaxHeight = Math.max(96, Math.min(scaledDesiredMenuHeight, availableSpace - 8));

      setOpenUp(shouldOpenUp);
      setMenuMaxHeight(`${calculatedMaxHeight}px`);

      if (menuPortal) {
        const preferredTop = shouldOpenUp
          ? (triggerRect.top - calculatedMaxHeight - 6)
          : (triggerRect.bottom + 6);
        const normalizedTop = Math.max(8, Math.min(preferredTop, window.innerHeight - calculatedMaxHeight - 8));
        const menuWidth = Math.max(120, triggerRect.width * normalizedMenuWidthScale);
        const rawLeft = menuAlign === "center"
          ? triggerRect.left + triggerRect.width / 2 - menuWidth / 2
          : menuAlign === "right"
            ? triggerRect.right - menuWidth
            : triggerRect.left;
        const normalizedLeft = Math.max(8, Math.min(rawLeft, window.innerWidth - menuWidth - 8));
        setMenuPortalStyle({
          position: "fixed",
          top: `${normalizedTop}px`,
          left: `${normalizedLeft}px`,
          width: `${menuWidth}px`,
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
  }, [
    filteredOptions.length,
    forceOpenDown,
    forceOpenUp,
    maxVisibleOptions,
    menuAlign,
    menuPortal,
    normalizedMenuHeightScale,
    normalizedMenuWidthScale,
    open
  ]);

  const inlineMenuStyle = menuPortal
    ? (menuPortalStyle || { position: "fixed", top: "-9999px", left: "-9999px", width: "0px", maxHeight: "0px" })
    : {
        ...(menuMaxHeight ? { maxHeight: menuMaxHeight } : {}),
        ...(normalizedMenuWidthScale !== 1
          ? {
              width: `${normalizedMenuWidthScale * 100}%`,
              right: "auto"
            }
          : {})
      };

  useEffect(() => {
    if (!open && searchQuery) {
      setSearchQuery("");
      if (typeof onSearchChange === "function") {
        onSearchChange("");
      }
    }
  }, [onSearchChange, open, searchQuery]);

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
      style={inlineMenuStyle}
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
            onChange={(event) => {
                const val = event.currentTarget.value;
                setSearchQuery(val);
                if (typeof onSearchChange === "function") {
                  onSearchChange(val);
                }
              }}
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
          <div className="custom-select-empty">{emptyText}</div>
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
