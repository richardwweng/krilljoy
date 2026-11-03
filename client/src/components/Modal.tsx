import { useEffect, useRef, type ReactNode } from "react";

/** A pop-up panel using the browser's built-in <dialog> (handles Esc and focus for us). */
export default function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={ref} className="modal panel" onClose={onClose} onClick={(e) => e.target === ref.current && ref.current?.close()} aria-label={title}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button type="button" className="btn-ghost" onClick={() => ref.current?.close()} aria-label="Close">✕</button>
      </div>
      {children}
    </dialog>
  );
}
