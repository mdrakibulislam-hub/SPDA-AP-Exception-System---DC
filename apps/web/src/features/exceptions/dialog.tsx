import { useEffect, useId, useRef, type ReactNode } from "react";
import "./dialogs.css";

export function WorkspaceDialog({ title, close, children, drawer = false, headerAction, restoreFocus }: {
  title: string;
  close: () => void;
  children: ReactNode;
  drawer?: boolean;
  headerAction?: ReactNode;
  restoreFocus?: () => HTMLElement | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      const target = restoreFocus?.() ?? previous;
      if (target instanceof HTMLElement) target.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog ref={dialog} className={drawer ? "spda-dialog spda-assistant-drawer" : "spda-dialog"} aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); close(); }}>
      <header className="spda-dialog-header"><h2 id={titleId}>{title}</h2>{headerAction ?? <button type="button" className="spda-dialog-close" aria-label="Close dialog" onClick={close}>
        <img src="/design/assign-multiplication-sign.svg" alt="" width={16} height={16} />
      </button>}</header>
      {children}
    </dialog>
  );
}

export function DialogActions({ submit, close, disabled = false, destructive = false }: {
  submit: string; close: () => void; disabled?: boolean; destructive?: boolean;
}) {
  return <div className="spda-actions spda-dialog-actions">
    <button type="button" className="spda-button spda-dialog-cancel" onClick={close}>Cancel</button>
    <button type="submit" className="spda-button spda-dialog-submit" data-destructive={destructive} disabled={disabled}>{submit}</button>
  </div>;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}
