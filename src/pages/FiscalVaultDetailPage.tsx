import {useMutation, useQuery} from "@tanstack/react-query";
import {Button, Chip, Spinner} from "@heroui/react";
import {ArrowLeft, Download} from "lucide-react";
import {useNavigate, useParams} from "react-router";
import {ActionTooltip} from "../components/ActionTooltip";
import {useCompany} from "../components/AppShell";
import {api, apiErrorMessage, downloadApiFile} from "../lib/api";
import {date, integer} from "../lib/format";
import type {FiscalVaultItem} from "../lib/types";

const STATUS_LABELS: Record<FiscalVaultItem["status"], string> = {
  archiving: "În curs de arhivare",
  archived: "Arhivat",
  imported: "Importat",
  needs_attention: "Necesită atenție",
  storage_failed: "Salvare eșuată",
  unsupported: "Format nesuportat",
};

export function isCurrentVaultDownload(
  variables: {companyId: string; document: FiscalVaultItem} | undefined,
  companyId: string | undefined,
  vaultItemId: string | undefined,
): boolean {
  return variables !== undefined
    && companyId !== undefined
    && vaultItemId !== undefined
    && variables.companyId === companyId
    && variables.document.id === vaultItemId;
}

export function FiscalVaultDetailPage() {
  const {company, can} = useCompany();
  const {vaultItemId} = useParams();
  const navigate = useNavigate();
  const item = useQuery({
    queryKey: ["fiscal-vault-item", company?.id, vaultItemId],
    enabled: Boolean(company?.id && vaultItemId && can("fiscal_vault.view")),
    queryFn: () => api<FiscalVaultItem>(`/companies/${company!.id}/vault/${vaultItemId}`),
  });
  const download = useMutation({
    mutationFn: ({companyId, document}: {companyId: string; document: FiscalVaultItem}) => downloadApiFile(
      `/companies/${companyId}/vault/${document.id}/download`,
      document.original?.filename ?? "document-anaf.zip",
    ),
  });
  const downloadBelongsToCurrentDocument = isCurrentVaultDownload(download.variables, company?.id, vaultItemId);

  if (!can("fiscal_vault.view")) return <p className="text-[var(--danger)]">Nu ai permisiunea necesară pentru Seiful fiscal.</p>;
  if (item.isLoading) return <div className="flex justify-center py-24"><Spinner/></div>;
  if (!item.data) return <p className="text-[var(--danger)]">{apiErrorMessage(item.error, "Documentul fiscal nu a putut fi încărcat.")}</p>;

  const document = item.data.data;
  const downloadDisabled = !document.original || (download.isPending && !downloadBelongsToCurrentDocument);
  const downloadReason = !document.original
    ? "Originalul ANAF nu este disponibil pentru acest document."
    : downloadDisabled ? "Așteaptă finalizarea descărcării curente." : "Descarcă originalul ANAF";
  return <div className="flex flex-col gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button variant="ghost" onPress={() => navigate("/seif-fiscal")}><ArrowLeft size={16}/> Înapoi la Seif</Button>
      {can("fiscal_vault.download") ? <ActionTooltip content={downloadReason} isDisabled={downloadDisabled}><Button variant="primary" isDisabled={downloadDisabled} isPending={download.isPending && downloadBelongsToCurrentDocument} onPress={() => company && download.mutate({companyId: company.id, document})}><Download size={16}/> Descarcă originalul ANAF</Button></ActionTooltip> : null}
    </div>
    {download.isError && downloadBelongsToCurrentDocument ? <p role="alert" className="text-sm text-[var(--danger)]">{apiErrorMessage(download.error, "Documentul nu a putut fi descărcat.")}</p> : null}
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-sm text-[var(--text-muted)]">Original ANAF arhivat</p><h2 className="mt-1 text-2xl font-bold">{document.document_number ?? "Document fără număr"}</h2><p className="mt-2 font-medium">{document.supplier_name ?? "Furnizor necunoscut"}</p></div>
        <Chip variant="soft" color={document.status === "imported" ? "success" : document.status === "storage_failed" ? "danger" : "warning"}><Chip.Label>{STATUS_LABELS[document.status]}</Chip.Label></Chip>
      </div>
      <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div><dt className="text-[var(--text-muted)]">ID mesaj ANAF</dt><dd className="mt-1 break-all font-mono">{document.anaf_message_id ?? "—"}</dd></div>
        <div><dt className="text-[var(--text-muted)]">ID descărcare ANAF</dt><dd className="mt-1 break-all font-mono">{document.anaf_download_id ?? "—"}</dd></div>
        <div><dt className="text-[var(--text-muted)]">Disponibil în ANAF</dt><dd className="mt-1">{date(document.anaf_available_at)}</dd></div>
        <div><dt className="text-[var(--text-muted)]">Emitere</dt><dd className="mt-1">{date(document.issue_date)}</dd></div>
        <div><dt className="text-[var(--text-muted)]">Arhivare Billwise</dt><dd className="mt-1">{date(document.archived_at)}</dd></div>
        <div><dt className="text-[var(--text-muted)]">Sigiliu MF</dt><dd className="mt-1">Păstrat, neverificat</dd></div>
        <div><dt className="text-[var(--text-muted)]">Fișier original</dt><dd className="mt-1">{document.original?.filename ?? "Indisponibil"}</dd></div>
        <div><dt className="text-[var(--text-muted)]">Mărime</dt><dd className="mt-1">{document.original ? `${integer(Math.ceil(document.original.size_bytes / 1024))} KB` : "—"}</dd></div>
        <div><dt className="text-[var(--text-muted)]">SHA-256</dt><dd className="mt-1 break-all font-mono text-xs">{document.original?.sha256 ?? "—"}</dd></div>
      </dl>
    </section>
  </div>;
}
