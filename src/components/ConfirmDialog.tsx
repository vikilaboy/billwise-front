import {type MouseEvent, type ReactNode, useEffect, useId, useRef} from "react";
import {createPortal} from "react-dom";
import {Button, Spinner} from "@heroui/react";
import {ActionTooltip} from "./ActionTooltip";

type ConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  tone?: "accent" | "success" | "warning" | "danger";
  isPending?: boolean;
  isConfirmDisabled?: boolean;
  confirmDisabledReason?: string;
  children?: ReactNode;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel,
  tone = "accent",
  isPending = false,
  isConfirmDisabled = false,
  confirmDisabledReason,
  children,
  onOpenChange,
  onConfirm,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const backgroundElements = Array.from(document.body.children)
      .filter((element) => element !== overlayRef.current)
      .map((element) => ({
        element,
        ariaHidden: element.getAttribute("aria-hidden"),
        inert: element.hasAttribute("inert"),
      }));
    document.body.classList.add("billwise-dialog-open");
    backgroundElements.forEach(({element}) => {
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
    });
    cancelRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isPending) onOpenChange(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.classList.remove("billwise-dialog-open");
      backgroundElements.forEach(({element, ariaHidden, inert}) => {
        if (inert) element.setAttribute("inert", "");
        else element.removeAttribute("inert");
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      });
    };
  }, [isOpen, isPending, onOpenChange]);

  if (!isOpen) return null;
  const closeFromBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !isPending) onOpenChange(false);
  };

  return createPortal(
    <div ref={overlayRef} className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onMouseDown={closeFromBackdrop}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative w-full max-w-[440px] rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-6 shadow-2xl"
      >
        <button
          type="button"
          aria-label="Închide"
          className="absolute right-4 top-4 rounded-lg px-2 py-1 text-xl text-[var(--text-muted)] hover:bg-[var(--bg-muted)]"
          disabled={isPending}
          onClick={() => onOpenChange(false)}
        >
          ×
        </button>
        <div className={`mb-4 h-2 w-12 rounded-full ${tone === "danger" ? "bg-[var(--danger)]" : "bg-[var(--accent)]"}`} />
        <h2 id={titleId} className="pr-10 text-lg font-bold">{title}</h2>
        <div id={descriptionId} className="mt-2 text-sm text-[var(--text-muted)]">{description}</div>
        {children ? <div className="mt-4">{children}</div> : null}
        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            className="rounded-xl px-4 py-2 text-sm font-semibold hover:bg-[var(--bg-muted)]"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            Renunță
          </button>
          <ActionTooltip content={isPending ? "Operația este în curs." : confirmDisabledReason ?? confirmLabel} isDisabled={isPending || isConfirmDisabled}>
            <Button
              variant={tone === "danger" ? "danger" : "primary"}
              isDisabled={isPending || isConfirmDisabled}
              onPress={onConfirm}
            >
              {isPending ? <Spinner size="sm" /> : null}
              {confirmLabel}
            </Button>
          </ActionTooltip>
        </div>
      </div>
    </div>,
    document.body,
  );
}
