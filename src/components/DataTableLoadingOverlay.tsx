import {Spinner} from "@heroui/react";

export function DataTableLoadingOverlay({isLoading}: {isLoading: boolean}) {
  if (!isLoading) return null;

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-[color-mix(in_srgb,var(--surface)_72%,transparent)] backdrop-blur-[1px]"
      role="status"
      aria-live="polite"
    >
      <span className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--text-muted)] shadow-[var(--shadow)]">
        <Spinner size="sm" /> Se actualizează…
      </span>
    </div>
  );
}
