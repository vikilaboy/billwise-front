import {useEffect, useRef} from "react";
import {Toast, toast} from "@heroui/react";
import {
  API_ERROR_EVENT,
  apiErrorDescription,
  clearApiFieldErrors,
  markApiFieldErrors,
  type ApiErrorEventDetail,
} from "../lib/apiErrorPresentation";

const DEDUPE_WINDOW_MS = 5000;

export function ApiErrorToast() {
  const lastToast = useRef({fingerprint: "", shownAt: 0});

  useEffect(() => {
    const onApiError = (event: Event) => {
      const {problem} = (event as CustomEvent<ApiErrorEventDetail>).detail;
      markApiFieldErrors(problem.errors);

      const description = apiErrorDescription(problem);
      const fingerprint = JSON.stringify([problem.status, problem.title, description, problem.errors]);
      const now = Date.now();
      if (
        lastToast.current.fingerprint === fingerprint
        && now - lastToast.current.shownAt < DEDUPE_WINDOW_MS
      ) return;

      lastToast.current = {fingerprint, shownAt: now};
      toast.danger(problem.title || "Cererea nu a putut fi procesată", {
        description,
        timeout: 7000,
      });
    };
    const clearChangedField = (event: Event) => {
      const field = event.target instanceof Element
        ? event.target.closest<HTMLElement>(`[data-api-invalid="true"]`)
        : null;
      if (!field) return;
      field.removeAttribute("data-api-invalid");
      field.removeAttribute("aria-invalid");
    };

    window.addEventListener(API_ERROR_EVENT, onApiError);
    document.addEventListener("input", clearChangedField, true);
    document.addEventListener("change", clearChangedField, true);
    return () => {
      window.removeEventListener(API_ERROR_EVENT, onApiError);
      document.removeEventListener("input", clearChangedField, true);
      document.removeEventListener("change", clearChangedField, true);
      clearApiFieldErrors();
    };
  }, []);

  return <Toast.Provider placement="top end" />;
}
