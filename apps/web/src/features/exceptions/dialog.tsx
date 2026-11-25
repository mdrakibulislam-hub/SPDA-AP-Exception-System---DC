import { Button } from "@SPDA-AP-Exception-System---DC/ui/components/button";
import { useEffect, useId, useRef, type ReactNode } from "react";

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
      <header><h2 id={titleId}>{title}</h2>{headerAction}</header>
      {children}
    </dialog>
  );
}

export function DialogActions({ submit, close, disabled = false }: { submit: string; close: () => void; disabled?: boolean }) {
  return <div className="spda-actions spda-dialog-actions">
    <Button type="button" variant="outline" onClick={close}>Cancel</Button>
    <Button type="submit" disabled={disabled}>{submit}</Button>
  </div>;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}
