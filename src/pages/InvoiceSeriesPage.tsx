import {useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Button, Chip, Input, Spinner, Switch} from "@heroui/react";
import {EmptyState} from "@heroui-pro/react/empty-state";
import {Hash, Plus, X} from "lucide-react";
import {useCompany} from "../components/AppShell";
import {api, ApiError} from "../lib/api";

// The API models `document_type` as a free-form string (max 50); only `invoice`
// is used in practice. These are the document kinds the UI offers, with RO labels.
type DocumentType = "invoice" | "proforma" | "storno" | "receipt";

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  invoice: "Factură",
  proforma: "Proformă",
  storno: "Storno",
  credit_note: "Storno",
  receipt: "Chitanță",
};

const DOCUMENT_TYPE_OPTIONS: {value: DocumentType; label: string}[] = [
  {value: "invoice", label: "Factură"},
  {value: "proforma", label: "Proformă"},
  {value: "storno", label: "Storno"},
  {value: "receipt", label: "Chitanță"},
];

// Shape of `InvoiceSeriesResource` (billwise-api).
type Series = {
  id: string;
  company_profile_id: string;
  document_type: string;
  name: string;
  prefix: string | null;
  next_number: number;
  formatted_next_number: string;
  padding: number;
  is_default: boolean;
  is_active: boolean;
};

function documentTypeLabel(type: string): string {
  return DOCUMENT_TYPE_LABELS[type] ?? type;
}

// Compose the next document number for display. Prefer the API-computed value;
// otherwise mirror its rule (`prefix` + zero-padded number, or plain concat).
function nextNumberDisplay(s: Series): string {
  if (s.formatted_next_number) return s.formatted_next_number;
  const prefix = s.prefix ?? "";
  return s.padding
    ? prefix + String(s.next_number).padStart(s.padding, "0")
    : prefix + String(s.next_number);
}

type FormState = {
  name: string;
  document_type: DocumentType;
  prefix: string;
  next_number: string;
  padding: string;
  is_default: boolean;
  is_active: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  document_type: "invoice",
  prefix: "",
  next_number: "1",
  padding: "4",
  is_default: false,
  is_active: true,
};

export function InvoiceSeriesPage() {
  const {company} = useCompany();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);

  const series = useQuery({
    queryKey: ["invoice-series", company?.id],
    queryFn: () => api<Series[]>(`/companies/${company!.id}/invoice-series`),
    enabled: Boolean(company?.id),
  });

  const rows = series.data?.data ?? [];

  return (
    <div className="flex flex-col gap-5">
      {/* Top row: primary action */}
      <div className="flex items-center justify-end">
        <Button variant="primary" onPress={() => setModalOpen(true)}>
          <Plus size={17} /> Serie nouă
        </Button>
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        {series.isLoading ? (
          <div className="flex items-center justify-center gap-2.5 py-24 text-sm text-[var(--text-muted)]">
            <Spinner size="sm" /> Se încarcă seriile…
          </div>
        ) : series.isError ? (
          <div className="py-24 text-center text-sm font-medium text-[var(--danger)]">
            {series.error instanceof ApiError
              ? (series.error.problem.detail ?? series.error.problem.title)
              : "Seriile nu au putut fi încărcate."}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState className="py-16">
            <EmptyState.Header>
              <EmptyState.Media variant="icon">
                <Hash size={22} />
              </EmptyState.Media>
              <EmptyState.Title>Nicio serie de documente</EmptyState.Title>
              <EmptyState.Description>
                Creează prima serie pentru a numerota automat facturile emise.
              </EmptyState.Description>
            </EmptyState.Header>
            <EmptyState.Content>
              <Button variant="primary" onPress={() => setModalOpen(true)}>
                <Plus size={17} /> Serie nouă
              </Button>
            </EmptyState.Content>
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--subtle)]">
                  {["Denumire", "Tip document", "Prefix"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-wide text-[var(--faint)]"
                    >
                      {h}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-[10.5px] font-bold uppercase tracking-wide text-[var(--faint)]">
                    Următorul număr
                  </th>
                  <th className="px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-wide text-[var(--faint)]">
                    Stare
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--subtle)]"
                  >
                    <td className="px-4 py-3 font-semibold text-[var(--text)]">
                      <span className="inline-flex items-center gap-2">
                        {s.name}
                        {s.is_default && (
                          <Chip size="sm" color="success" variant="soft">
                            <Chip.Label>Implicită</Chip.Label>
                          </Chip>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">
                      {documentTypeLabel(s.document_type)}
                    </td>
                    <td className="px-4 py-3">
                      {s.prefix ? (
                        <span className="rounded bg-[var(--bg-muted)] px-2 py-0.5 font-semibold tabular-nums">
                          {s.prefix}
                        </span>
                      ) : (
                        <span className="text-[var(--faint)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--text)]">
                      {nextNumberDisplay(s)}
                    </td>
                    <td className="px-4 py-3">
                      <Chip size="sm" color={s.is_active ? "success" : "default"} variant="soft">
                        <Chip.Label>{s.is_active ? "Activă" : "Inactivă"}</Chip.Label>
                      </Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && company?.id && (
        <SeriesModal
          companyId={company.id}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            queryClient.invalidateQueries({queryKey: ["invoice-series"]});
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function SeriesModal({
  companyId,
  onClose,
  onSaved,
}: {
  companyId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const mutation = useMutation({
    mutationFn: () =>
      api<Series>(`/companies/${companyId}/invoice-series`, {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          document_type: form.document_type,
          prefix: form.prefix,
          next_number: Number(form.next_number) || 1,
          padding: Number(form.padding) || 0,
          is_default: form.is_default,
          is_active: form.is_active,
        }),
      }),
    onSuccess: onSaved,
  });

  const problem = mutation.error instanceof ApiError ? mutation.error.problem : undefined;
  const fieldErrors = problem?.errors ?? {};

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({...prev, [key]: value}));
  }

  function submit() {
    mutation.mutate();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Serie nouă"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 className="text-[15px] font-semibold text-[var(--text)]">Serie nouă</h2>
          <Button isIconOnly variant="ghost" size="sm" aria-label="Închide" onPress={onClose}>
            <X size={17} />
          </Button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-5">
          <Field label="Denumire" error={fieldErrors.name?.[0]}>
            <Input
              fullWidth
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="ex. Facturi 2026"
            />
          </Field>

          <Field label="Tip document" error={fieldErrors.document_type?.[0]}>
            <select
              value={form.document_type}
              onChange={(e) => update("document_type", e.target.value as DocumentType)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
            >
              {DOCUMENT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Prefix" error={fieldErrors.prefix?.[0]}>
            <Input
              fullWidth
              value={form.prefix}
              onChange={(e) => update("prefix", e.target.value)}
              placeholder="ex. FCT"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Următorul număr de start" error={fieldErrors.next_number?.[0]}>
              <Input
                fullWidth
                type="number"
                min={1}
                value={form.next_number}
                onChange={(e) => update("next_number", e.target.value)}
              />
            </Field>
            <Field label="Padding" error={fieldErrors.padding?.[0]}>
              <Input
                fullWidth
                type="number"
                min={0}
                value={form.padding}
                onChange={(e) => update("padding", e.target.value)}
              />
            </Field>
          </div>

          <label className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-medium text-[var(--text)]">Serie implicită</span>
            <Switch
              isSelected={form.is_default}
              onChange={(v) => update("is_default", v)}
              aria-label="Serie implicită"
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </label>

          <label className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-medium text-[var(--text)]">Activă</span>
            <Switch
              isSelected={form.is_active}
              onChange={(v) => update("is_active", v)}
              aria-label="Activă"
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </label>

          {problem && !problem.errors && (
            <div className="rounded-lg bg-[var(--danger-soft,var(--bg-muted))] px-3 py-2 text-[12.5px] font-medium text-[var(--danger)]">
              {problem.detail ?? problem.title}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
          <Button variant="outline" onPress={onClose}>
            Anulează
          </Button>
          <Button
            variant="primary"
            onPress={submit}
            isDisabled={mutation.isPending || !form.name.trim()}
          >
            {mutation.isPending ? "Se salvează…" : "Salvează"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-semibold text-[var(--text-muted)]">{label}</span>
      {children}
      {error && <span className="text-[11.5px] font-medium text-[var(--danger)]">{error}</span>}
    </div>
  );
}
