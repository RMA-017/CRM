import { useEffect, useMemo, useRef, useState } from "react";

function CustomSelect({
  value,
  options,
  placeholder,
  onChange,
  id,
  error = false,
  forceOpenDown = false,
  maxVisibleOptions = null
}) {
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [menuMaxHeight, setMenuMaxHeight] = useState("");

  const selectedLabel = useMemo(() => {
    const selected = options.find((option) => option.value === value);
    return selected ? selected.label : placeholder;
  }, [options, placeholder, value]);

  useEffect(() => {
    if (!open || !triggerRef.current) {
      setOpenUp(false);
      setMenuMaxHeight("");
      return;
    }

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - triggerRect.bottom - 12;
    const spaceAbove = triggerRect.top - 12;
    const normalizedMaxVisibleOptions = Number.isInteger(maxVisibleOptions) && maxVisibleOptions > 0
      ? maxVisibleOptions
      : null;
    const visibleOptionsCount = normalizedMaxVisibleOptions
      ? Math.max(1, Math.min(options.length, normalizedMaxVisibleOptions))
      : null;
    const desiredMenuHeight = visibleOptionsCount
      ? ((visibleOptionsCount * 40) + 8)
      : 184;
    const shouldOpenUp = forceOpenDown
      ? false
      : (spaceBelow < desiredMenuHeight && spaceAbove > spaceBelow);
    const availableSpace = shouldOpenUp ? spaceAbove : spaceBelow;
    const calculatedMaxHeight = Math.max(120, Math.min(desiredMenuHeight, availableSpace - 8));

    setOpenUp(shouldOpenUp);
    setMenuMaxHeight(`${calculatedMaxHeight}px`);
  }, [forceOpenDown, maxVisibleOptions, open, options.length]);

  useEffect(() => {
    function handleOutside(event) {
      if (!wrapRef.current) {
        return;
      }
      if (!wrapRef.current.contains(event.target)) {
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

  return (
    <div ref={wrapRef} id={id} className={`custom-select${openUp ? " open-up" : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`custom-select-trigger${error ? " input-error" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open ? "true" : "false"}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{selectedLabel}</span>
      </button>

      <div
        className="custom-select-menu"
        role="listbox"
        hidden={!open}
        style={menuMaxHeight ? { maxHeight: menuMaxHeight } : undefined}
        onWheel={(event) => {
          event.stopPropagation();
        }}
        onTouchMove={(event) => {
          event.stopPropagation();
        }}
      >
        {options.map((option) => (
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
        ))}
      </div>
    </div>
  );
}

export default CustomSelect;
