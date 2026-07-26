import type {ReactNode} from "react";
import {AlertDialog, Button, Spinner} from "@heroui/react";

type ConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  tone?: "accent" | "success" | "warning" | "danger";
  isPending?: boolean;
  isConfirmDisabled?: boolean;
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
  children,
  onOpenChange,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <AlertDialog.Trigger className="sr-only" aria-hidden="true">
        Deschide confirmarea
      </AlertDialog.Trigger>
      <AlertDialog.Backdrop variant="blur">
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[440px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status={tone} />
              <AlertDialog.Heading>{title}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <div className="text-sm text-[var(--text-muted)]">{description}</div>
              {children}
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary" isDisabled={isPending}>
                Renunță
              </Button>
              <Button
                variant={tone === "danger" ? "danger" : "primary"}
                isDisabled={isPending || isConfirmDisabled}
                onPress={onConfirm}
              >
                {isPending ? <Spinner size="sm" /> : null}
                {confirmLabel}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}
