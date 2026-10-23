import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import ActionIconButton from "./ActionIconButton.jsx";

export default function CompactDialog({ title, closeLabel, busy, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return createPortal(<dialog ref={ref} className="internal-lesson-dialog caregiver-dialog" aria-label={title}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="all-users-head"><h3>{title}</h3><ActionIconButton label={closeLabel} icon="close" disabled={busy} onClick={onClose} /></div>
    {children}
  </dialog>, document.body);
}
