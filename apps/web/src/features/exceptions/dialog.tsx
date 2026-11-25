import { Button } from "@SPDA-AP-Exception-System---DC/ui/components/button";
import { useEffect, useRef, type ReactNode } from "react";

export function WorkspaceDialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog ref={dialog} className="spda-dialog" aria-labelledby="workspace-dialog-title"
      onCancel={event => { event.preventDefault(); close(); }}>
      <header><h2 id="workspace-dialog-title">{title}</h2></header>
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
