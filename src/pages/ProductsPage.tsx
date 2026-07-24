import {useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Button, Input, Spinner} from "@heroui/react";
import {Package, Pencil, Plus, RotateCcw, Search, Trash2, X} from "lucide-react";
import {useCompany} from "../components/AppShell";
import {DataTableLoadingOverlay} from "../components/DataTableLoadingOverlay";
import {DataTablePagination} from "../components/DataTablePagination";
import {api, apiErrorMessage, ApiError, listQuery} from "../lib/api";
import {money} from "../lib/format";
import type {Product, VatCategory} from "../lib/types";
import {useServerDataGridState} from "../lib/useServerDataGridState";

type ProductForm = {
  type: "product" | "service";
  name: string;
  description: string;
  unit: string;
  unit_code: string;
  unit_price: string;
  currency: string;
  vat_rate: string;
  vat_category: VatCategory;
  vat_exemption_code: string;
  vat_exemption_reason: string;
  is_active: boolean;
};

const emptyForm: ProductForm = {
  type: "service", name: "", description: "", unit: "buc", unit_code: "C62",
  unit_price: "0", currency: "RON", vat_rate: "19", vat_category: "S",
  vat_exemption_code: "", vat_exemption_reason: "", is_active: true,
};

function fromProduct(product: Product): ProductForm {
  return {
    type: product.type, name: product.name, description: product.description ?? "",
    unit: product.unit, unit_code: product.unit_code,
    unit_price: String(product.unit_price_cents / 100), currency: product.currency,
    vat_rate: product.vat_rate, vat_category: product.vat_category,
    vat_exemption_code: product.vat_exemption_code ?? "",
    vat_exemption_reason: product.vat_exemption_reason ?? "", is_active: product.is_active,
  };
}

export function ProductsPage() {
  const {company} = useCompany();
  const queryClient = useQueryClient();
  const grid = useServerDataGridState({defaultSort: {column: "name", direction: "ascending"}, sortColumns: ["name", "unit_price_cents"]});
  const [editing, setEditing] = useState<Product | null | undefined>(undefined);
  const products = useQuery({
    queryKey: ["products", company?.id, grid.page, grid.debouncedSearch, grid.apiSort],
    queryFn: () => api<Product[]>(`/companies/${company!.id}/products${listQuery({
      page: grid.page, perPage: 20, sort: grid.apiSort,
      filter: grid.debouncedSearch ? {name: {contains: grid.debouncedSearch}} : undefined,
    })}`),
    enabled: Boolean(company?.id),
    placeholderData: (previous) => previous,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`/companies/${company!.id}/products/${id}`, {method: "DELETE"}),
    onSuccess: () => queryClient.invalidateQueries({queryKey: ["products", company?.id]}),
  });
  const rows = products.data?.data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="flex h-10 min-w-[260px] items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3">
            <Search size={16} className="text-[var(--faint)]" />
            <input value={grid.search} onChange={(event) => grid.setSearch(event.target.value)} placeholder="Caută în catalog…" className="w-full bg-transparent text-sm outline-none" />
          </label>
          <Button size="sm" variant="outline" isDisabled={!grid.isDirty} onPress={grid.reset}><RotateCcw size={15} /> Resetează</Button>
        </div>
        <Button variant="primary" onPress={() => setEditing(null)}><Plus size={16} /> Adaugă produs sau serviciu</Button>
      </div>
      {remove.isError ? (
        <p role="alert" className="rounded-xl bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {apiErrorMessage(remove.error, "Produsul nu a putut fi șters.")}
        </p>
      ) : null}

      <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <DataTableLoadingOverlay isLoading={products.isFetching && !products.isLoading} />
        {products.isLoading ? <div className="flex justify-center gap-2 py-20"><Spinner size="sm" /> Se încarcă…</div>
          : products.isError ? <div className="py-20 text-center text-sm text-[var(--danger)]">Catalogul nu a putut fi încărcat.</div>
          : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <Package size={28} className="text-[var(--faint)]" />
              <div><div className="font-semibold">Catalogul este gol</div><div className="text-sm text-[var(--text-muted)]">Adaugă produse sau servicii reutilizabile pe facturi.</div></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-sm">
                <thead className="bg-[var(--bg-muted)] text-left text-xs uppercase text-[var(--text-muted)]">
                  <tr><th className="p-3">Denumire</th><th className="p-3">Tip</th><th className="p-3">UM</th><th className="p-3 text-right">Preț</th><th className="p-3">TVA</th><th className="p-3">Stare</th><th className="p-3 text-right">Acțiuni</th></tr>
                </thead>
                <tbody>
                  {rows.map((product) => (
                    <tr key={product.id} className="border-t border-[var(--border)]">
                      <td className="p-3"><div className="font-semibold">{product.name}</div><div className="max-w-xs truncate text-xs text-[var(--text-muted)]">{product.description}</div></td>
                      <td className="p-3">{product.type === "service" ? "Serviciu" : "Produs"}</td>
                      <td className="p-3">{product.unit} · {product.unit_code}</td>
                      <td className="p-3 text-right tabular-nums">{money(product.unit_price_cents, product.currency)}</td>
                      <td className="p-3">{product.vat_category} · {product.vat_rate}%</td>
                      <td className="p-3">{product.is_active ? "Activ" : "Inactiv"}</td>
                      <td className="p-3"><div className="flex justify-end gap-1">
                        <Button isIconOnly size="sm" variant="ghost" aria-label={`Editează ${product.name}`} onPress={() => setEditing(product)}><Pencil size={15} /></Button>
                        <Button isIconOnly size="sm" variant="ghost" aria-label={`Șterge ${product.name}`} onPress={() => {
                          if (window.confirm(`Ștergi ${product.name} din catalog?`)) remove.mutate(product.id);
                        }}><Trash2 size={15} className="text-[var(--danger)]" /></Button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        <DataTablePagination pagination={products.data?.meta?.pagination} onPageChange={grid.setPage} />
      </div>
      {editing !== undefined && company?.id ? (
        <ProductModal companyId={company.id} product={editing} onClose={() => setEditing(undefined)} onSaved={() => {
          void queryClient.invalidateQueries({queryKey: ["products", company.id]});
          setEditing(undefined);
        }} />
      ) : null}
    </div>
  );
}

function ProductModal({companyId, product, onClose, onSaved}: {companyId: string; product: Product | null; onClose: () => void; onSaved: () => void}) {
  const [form, setForm] = useState<ProductForm>(() => product ? fromProduct(product) : emptyForm);
  const save = useMutation({
    mutationFn: () => api<Product>(`/companies/${companyId}/products${product ? `/${product.id}` : ""}`, {
      method: product ? "PUT" : "POST",
      body: JSON.stringify({
        ...form,
        unit_price_cents: Math.round(Number(form.unit_price) * 100),
        vat_exemption_code: form.vat_exemption_code.trim() || null,
        vat_exemption_reason: form.vat_exemption_reason.trim() || null,
        unit_price: undefined,
      }),
    }),
    onSuccess: onSaved,
  });
  const errors = save.error instanceof ApiError ? save.error.problem.errors ?? {} : {};
  const set = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => setForm((current) => ({...current, [key]: value}));
  const input = "h-10 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/45 p-4" role="dialog" aria-modal="true" aria-label={product ? "Editează produs" : "Produs nou"}>
      <div className="w-full max-w-2xl rounded-2xl bg-[var(--surface)] shadow-[var(--shadow-lg)]">
        <header className="flex items-center justify-between border-b border-[var(--border)] p-5"><h2 className="font-semibold">{product ? "Editează produsul" : "Produs sau serviciu nou"}</h2><Button isIconOnly variant="ghost" onPress={onClose}><X size={17} /></Button></header>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Tip"><select className={input} value={form.type} onChange={(e) => set("type", e.target.value as ProductForm["type"])}><option value="service">Serviciu</option><option value="product">Produs</option></select></Field>
          <Field label="Denumire" error={errors.name?.[0]}><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Descriere" className="sm:col-span-2"><Input value={form.description} onChange={(e) => set("description", e.target.value)} /></Field>
          <Field label="Unitate"><Input value={form.unit} onChange={(e) => set("unit", e.target.value)} /></Field>
          <Field label="Cod UM"><Input value={form.unit_code} onChange={(e) => set("unit_code", e.target.value.toUpperCase())} /></Field>
          <Field label="Preț unitar"><Input type="number" value={form.unit_price} onChange={(e) => set("unit_price", e.target.value)} /></Field>
          <Field label="Monedă"><Input value={form.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} /></Field>
          <Field label="Categorie TVA"><select className={input} value={form.vat_category} onChange={(e) => set("vat_category", e.target.value as VatCategory)}>{["S","AE","E","Z","K","G","O"].map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Cotă TVA"><Input type="number" value={form.vat_rate} onChange={(e) => set("vat_rate", e.target.value)} /></Field>
          <Field label="Cod scutire"><Input value={form.vat_exemption_code} onChange={(e) => set("vat_exemption_code", e.target.value)} /></Field>
          <Field label="Motiv scutire"><Input value={form.vat_exemption_reason} onChange={(e) => set("vat_exemption_reason", e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} /> Activ</label>
          {save.isError && !Object.keys(errors).length ? <p role="alert" className="text-sm text-[var(--danger)]">Datele nu au putut fi salvate.</p> : null}
        </div>
        <footer className="flex justify-end gap-2 border-t border-[var(--border)] p-4"><Button variant="outline" onPress={onClose}>Anulează</Button><Button variant="primary" isDisabled={!form.name.trim() || save.isPending} onPress={() => save.mutate()}>{save.isPending ? <Spinner size="sm" /> : null} Salvează</Button></footer>
      </div>
    </div>
  );
}

function Field({label, error, className, children}: {label: string; error?: string; className?: string; children: React.ReactNode}) {
  return <label className={`flex flex-col gap-1.5 ${className ?? ""}`}><span className="text-xs font-semibold text-[var(--text-muted)]">{label}</span>{children}{error ? <span className="text-xs text-[var(--danger)]">{error}</span> : null}</label>;
}
