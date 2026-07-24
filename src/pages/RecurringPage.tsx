import {Button} from "@heroui/react";
import {EmptyState} from "@heroui-pro/react/empty-state";
import {Plus, Repeat} from "lucide-react";

// Recurring invoices have no API yet — show the concept + a disabled CTA.
export function RecurringPage() {
  return (
    <div>
      <div className="mb-[18px] flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 max-w-[520px] text-sm text-[var(--text-muted)]">
          Șabloane care vor genera ciorne de factură la intervalul stabilit, fără emitere sau trimitere automată.
        </p>
        <Button variant="primary" isDisabled>
          <Plus size={16} /> Șablon nou
        </Button>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]">
        <EmptyState size="md">
          <EmptyState.Header>
            <EmptyState.Media variant="icon">
              <Repeat size={24} />
            </EmptyState.Media>
            <EmptyState.Title>Facturi recurente — în curând</EmptyState.Title>
            <EmptyState.Description>
              Vei putea genera controlat ciorne lunar sau trimestrial. Emiterea, emailul și trimiterea în SPV vor rămâne
              acțiuni explicite.
            </EmptyState.Description>
          </EmptyState.Header>
        </EmptyState>
      </div>
    </div>
  );
}
