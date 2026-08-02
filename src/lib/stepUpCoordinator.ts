import type {ProblemDetails} from "./api";

export const STEP_UP_REQUIRED_EVENT = "billwise:step-up-required";

export type PendingStepUp = {
  problem: ProblemDetails;
  retry: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

export function requestStepUp<T>(problem: ProblemDetails, retry: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const detail: PendingStepUp = {
      problem,
      retry,
      resolve: (value) => resolve(value as T),
      reject,
    };
    window.dispatchEvent(new CustomEvent<PendingStepUp>(STEP_UP_REQUIRED_EVENT, {detail}));
  });
}
