import type {ReactElement, ReactNode} from "react";
import {Tooltip} from "@heroui/react";

export type RequiredFieldRule = {
  label: string;
  missing: boolean;
};

export function requiredFieldsReason(fields: RequiredFieldRule[]): string | null {
  const missingFields = fields.filter((field) => field.missing).map((field) => field.label);
  return missingFields.length > 0
    ? `Completează câmpurile obligatorii: ${missingFields.join(", ")}.`
    : null;
}

export function combineDisabledReasons(...reasons: Array<string | null | false | undefined>): string | null {
  const activeReasons = reasons.filter((reason): reason is string => typeof reason === "string" && reason.length > 0);
  return activeReasons.length > 0 ? activeReasons.join(" ") : null;
}

export function ActionTooltip({
  content,
  isDisabled = false,
  className,
  children,
}: {
  content: ReactNode;
  isDisabled?: boolean;
  className?: string;
  children: ReactElement;
}) {
  if (isDisabled) {
    return (
      <Tooltip delay={300}>
        <Tooltip.Trigger className={`inline-flex ${className ?? ""}`} aria-label={typeof content === "string" ? content : undefined}>
          {children}
        </Tooltip.Trigger>
        <Tooltip.Content>{content}</Tooltip.Content>
      </Tooltip>
    );
  }

  return (
    <Tooltip delay={300}>
      {children}
      <Tooltip.Content>{content}</Tooltip.Content>
    </Tooltip>
  );
}
