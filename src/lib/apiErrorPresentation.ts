import type {ProblemDetails} from "./api";

export const API_ERROR_EVENT = "billwise:api-error";
const INVALID_ATTRIBUTE = "data-api-invalid";

export type ApiErrorEventDetail = {
  problem: ProblemDetails;
};

function normalizedFieldName(value: string): string {
  return value
    .replace(/\[([^\]]+)\]/g, ".$1")
    .replace(/^\./, "");
}

export function apiErrorDescription(problem: ProblemDetails): string | undefined {
  const fieldMessages = Object.values(problem.errors ?? {}).flat();
  const uniqueMessages = [...new Set(fieldMessages.filter(Boolean))];

  if (uniqueMessages.length > 0) {
    const visible = uniqueMessages.slice(0, 3);
    const suffix = uniqueMessages.length > visible.length
      ? ` Încă ${uniqueMessages.length - visible.length} erori.`
      : "";
    return `${visible.join(" ")}${suffix}`;
  }

  return problem.detail && problem.detail !== problem.title ? problem.detail : undefined;
}

export function clearApiFieldErrors(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>(`[${INVALID_ATTRIBUTE}="true"]`).forEach((element) => {
    element.removeAttribute(INVALID_ATTRIBUTE);
    element.removeAttribute("aria-invalid");
  });
}

export function markApiFieldErrors(
  errors: Record<string, string[]> | undefined,
  root: ParentNode = document,
): number {
  clearApiFieldErrors(root);
  if (!errors) return 0;

  const fields = new Set(Object.keys(errors).map(normalizedFieldName));
  const matchedTargets = new Set<HTMLElement>();

  root.querySelectorAll<HTMLElement>("[name], [id], [data-api-fields]").forEach((element) => {
    const aliases = element.getAttribute("data-api-fields")?.split(/\s+/) ?? [];
    const names = [element.getAttribute("name"), element.getAttribute("id"), ...aliases]
      .filter((value): value is string => Boolean(value))
      .map(normalizedFieldName);
    if (!names.some((name) => fields.has(name))) return;

    const visualTarget = element.querySelector<HTMLElement>(".select, .text-field, .date-picker, .checkbox, .radio-group, .switch")
      ?? element.closest<HTMLElement>(".select, .text-field, .date-picker, .checkbox, .radio-group, .switch")
      ?? element;
    matchedTargets.add(visualTarget);
  });

  matchedTargets.forEach((target) => {
    target.setAttribute(INVALID_ATTRIBUTE, "true");
    target.setAttribute("aria-invalid", "true");
  });

  return matchedTargets.size;
}

export function dispatchApiError(problem: ProblemDetails): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ApiErrorEventDetail>(API_ERROR_EVENT, {
    detail: {problem},
  }));
}
