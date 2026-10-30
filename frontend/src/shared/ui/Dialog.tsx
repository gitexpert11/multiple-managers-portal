import { useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react';

interface DialogProps extends Omit<HTMLAttributes<HTMLDialogElement>, 'onClose'> {
  open: boolean;
  onClose: () => void;
  children?: ReactNode;
}

/**
 * Thin wrapper over the native <dialog>: opens modally when `open` flips to
 * true, closes when it flips to false, and reports backdrop clicks / Escape
 * through `onClose` so the parent owns the open state.
 */
export function Dialog({ open, onClose, children, ...rest }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      {...rest}
      onClose={() => {
        if (open) onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // backdrop click
      }}
    >
      {children}
    </dialog>
  );
}
