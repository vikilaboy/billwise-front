import type {ReactNode} from "react";
import type {Address, Invoice, InvoiceBankAccountSnapshot} from "../lib/types";
import {date, exchangeRate, money} from "../lib/format";

const LABELS = {
  invoice: ["Factură", "Invoice"],
  correctionInvoice: ["Factură de corecție", "Correction invoice"],
  creditNote: ["Notă de credit", "Credit note"],
  corrects: ["Corectează", "Corrects"],
  supplier: ["Furnizor", "Supplier"],
  customer: ["Client", "Customer"],
  issueDate: ["Data emiterii", "Issue date"],
  dueDate: ["Data scadenței", "Due date"],
  description: ["Descriere", "Description"],
  unit: ["UM", "Unit"],
  quantity: ["Cantitate", "Quantity"],
  unitPrice: ["Preț unitar", "Unit price"],
  vat: ["TVA", "VAT"],
  value: ["Valoare", "Value"],
  vatBreakdown: ["Defalcare TVA", "VAT breakdown"],
  subtotal: ["Subtotal", "Subtotal"],
  totalVat: ["Total TVA", "Total VAT"],
  totalDue: ["Total de plată", "Total due"],
  creditGranted: ["Credit acordat", "Credit granted"],
  billingPeriod: ["Perioada ajustată", "Adjustment period"],
  references: ["Facturi de referință", "Referenced invoices"],
  adjustment: ["Motivul ajustării", "Adjustment reason"],
  ronEquivalent: ["Echivalent RON", "RON equivalent"],
  bnrRate: ["Curs BNR", "NBR exchange rate"],
  bankAccounts: ["Conturi bancare", "Bank accounts"],
  notes: ["Mențiuni", "Notes"],
  taxId: ["CUI/CIF", "Tax ID"],
  registrationNumber: ["Nr. Registrul Comerțului", "Registration number"],
} as const;

type LabelKey = keyof typeof LABELS;

function LabelPair({name, bilingual, className = ""}: {name: LabelKey; bilingual: boolean; className?: string}) {
  const [ro, en] = LABELS[name];
  return (
    <span className={className}>
      <span className="block">{ro}</span>
      {bilingual ? <span className="mt-0.5 block text-[.82em] font-medium normal-case tracking-normal text-[#8a958f]">{en}</span> : null}
    </span>
  );
}

function addressLine(address: Address | null | undefined): string {
  if (!address) return "";
  return [
    address.street,
    address.street_details,
    address.resolved_city ?? address.city_name,
    address.resolved_region ?? address.region_name,
    address.postal_code,
    address.country_code,
  ].filter(Boolean).join(", ");
}

function SectionTitle({name, bilingual}: {name: LabelKey; bilingual: boolean}) {
  return (
    <div className="mb-2 text-[9px] font-extrabold uppercase tracking-[.05em] text-[#64716a]">
      <LabelPair name={name} bilingual={bilingual} />
    </div>
  );
}

function PartyCard({title, bilingual, children}: {
  title: "supplier" | "customer";
  bilingual: boolean;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[#dfe5e1] bg-[#f4f7f5] p-3.5">
      <SectionTitle name={title} bilingual={bilingual} />
      {children}
    </div>
  );
}

function bankAccountLine(bank: InvoiceBankAccountSnapshot): string {
  if (bank.scheme === "iban") {
    return [bank.iban, bank.swift_bic ? `SWIFT ${bank.swift_bic}` : null].filter(Boolean).join(" · ");
  }
  if (bank.scheme === "uk_domestic") {
    return [bank.sort_code, bank.account_number].filter(Boolean).join(" / ");
  }
  return [bank.routing_number, bank.account_number].filter(Boolean).join(" / ");
}

export function InvoiceDocumentPreview({invoice}: {invoice: Invoice}) {
  const seller = invoice.company_profile;
  const customer = invoice.customer;
  const bilingual = invoice.locale === "en";
  const currency = invoice.currency;
  const isForeign = currency !== "RON";
  const directionSign = invoice.financial_direction === "credit" ? -1 : 1;
  const signed = (value: number | null | undefined) => Math.abs(value ?? 0) * directionSign;
  const documentTitle = invoice.document_type === "correction" ? "correctionInvoice" : invoice.document_type === "credit_note" ? "creditNote" : "invoice";
  const sellerDisplayName = seller?.trade_name || seller?.legal_name || "—";
  const sellerInitial = sellerDisplayName.slice(0, 1).toUpperCase();

  return (
    <article
      aria-label={`Preview document ${invoice.formatted_number}`}
      className="mx-auto w-full max-w-[820px] overflow-hidden rounded-xl bg-white px-6 py-7 text-[11px] leading-[1.42] text-[#17211b] shadow-[0_10px_40px_rgba(24,24,27,.12)] sm:px-8 sm:py-9"
    >
      <header className="grid grid-cols-[minmax(0,1fr)_auto] gap-5 border-b-2 border-[#17211b] pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#16a34a] text-[18px] font-extrabold text-white"
          >
            {sellerInitial}
          </span>
          <div className="min-w-0">
            <div className="text-[17px] font-extrabold tracking-[-.02em]">{sellerDisplayName}</div>
            {seller?.trade_name && seller.trade_name !== seller.legal_name ? (
              <div className="mt-0.5 text-[10px] text-[#64716a]">{seller.legal_name}</div>
            ) : null}
          </div>
        </div>
        <div className="text-right tabular-nums">
          <div className="text-[20px] font-extrabold uppercase leading-none">
            <LabelPair name={documentTitle} bilingual={bilingual} />
          </div>
          <div className="mt-2 text-[13px] font-extrabold text-[#16a34a]">{invoice.formatted_number}</div>
          {invoice.corrected_invoice ? (
            <div className="mt-1 text-[#64716a]">
              <LabelPair name="corrects" bilingual={bilingual} /> {invoice.corrected_invoice.formatted_number}
            </div>
          ) : null}
          <div className="mt-2">
            <span className="text-[#64716a]">{LABELS.issueDate[0]}:</span> {date(invoice.issue_date)}
          </div>
          {bilingual ? <div className="text-[9px] text-[#8a958f]">{LABELS.issueDate[1]}: {date(invoice.issue_date)}</div> : null}
          {invoice.due_date ? (
            <>
              <div>
                <span className="text-[#64716a]">{LABELS.dueDate[0]}:</span> {date(invoice.due_date)}
              </div>
              {bilingual ? <div className="text-[9px] text-[#8a958f]">{LABELS.dueDate[1]}: {date(invoice.due_date)}</div> : null}
            </>
          ) : null}
        </div>
      </header>

      <section className="mt-4 grid grid-cols-2 gap-2.5">
        <PartyCard title="supplier" bilingual={bilingual}>
          <div className="text-[12px] font-extrabold">{seller?.legal_name ?? "—"}</div>
          <div className="mt-1">
            {LABELS.taxId[0]}: {seller?.tax_id ?? "—"}
            {bilingual ? <span className="block text-[9px] text-[#8a958f]">{LABELS.taxId[1]}: {seller?.tax_id ?? "—"}</span> : null}
          </div>
          {seller?.registration_number ? (
            <div>
              {LABELS.registrationNumber[0]}: {seller.registration_number}
              {bilingual ? <span className="block text-[9px] text-[#8a958f]">{LABELS.registrationNumber[1]}: {seller.registration_number}</span> : null}
            </div>
          ) : null}
          <div>{addressLine(seller?.address) || "—"}</div>
          {seller?.email ? <div className="text-[#64716a]">{seller.email}</div> : null}
        </PartyCard>
        <PartyCard title="customer" bilingual={bilingual}>
          <div className="text-[12px] font-extrabold">{customer?.name ?? "—"}</div>
          {customer?.tax_id ? (
            <div className="mt-1">
              {LABELS.taxId[0]}: {customer.tax_id}
              {bilingual ? <span className="block text-[9px] text-[#8a958f]">{LABELS.taxId[1]}: {customer.tax_id}</span> : null}
            </div>
          ) : null}
          {customer?.registration_number ? (
            <div>
              {LABELS.registrationNumber[0]}: {customer.registration_number}
              {bilingual ? <span className="block text-[9px] text-[#8a958f]">{LABELS.registrationNumber[1]}: {customer.registration_number}</span> : null}
            </div>
          ) : null}
          <div>{addressLine(customer?.address) || "—"}</div>
          {customer?.email ? <div className="text-[#64716a]">{customer.email}</div> : null}
        </PartyCard>
      </section>

      {invoice.billing_period_start && invoice.billing_period_end ? <section className="mt-4 rounded-md bg-[#f4f7f5] px-3 py-2"><SectionTitle name="billingPeriod" bilingual={bilingual} />{date(invoice.billing_period_start)} – {date(invoice.billing_period_end)}</section> : null}
      {(invoice.references?.length ?? 0) > 0 ? <section className="mt-4 rounded-md bg-[#f4f7f5] px-3 py-2"><SectionTitle name="references" bilingual={bilingual} />{invoice.references.map((reference) => reference.formatted_number).filter(Boolean).join(", ")}</section> : null}

      <div className="mt-5">
        <table className="w-full table-fixed border-collapse text-[9px] tabular-nums">
          <thead>
            <tr
              className="bg-[#46504b] text-left text-[8.5px] font-bold uppercase tracking-[.03em] text-white"
            >
              <th className="w-[4%] px-1.5 py-2">#</th>
              <th className="w-[39%] px-1.5 py-2"><LabelPair name="description" bilingual={bilingual} /></th>
              <th className="w-[10%] px-1.5 py-2"><LabelPair name="unit" bilingual={bilingual} /></th>
              <th className="w-[10%] px-1.5 py-2 text-right"><LabelPair name="quantity" bilingual={bilingual} /></th>
              <th className="w-[15%] px-1.5 py-2 text-right"><LabelPair name="unitPrice" bilingual={bilingual} /></th>
              <th className="w-[8%] px-1.5 py-2 text-right"><LabelPair name="vat" bilingual={bilingual} /></th>
              <th className="w-[14%] px-1.5 py-2 text-right"><LabelPair name="value" bilingual={bilingual} /></th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line, index) => (
              <tr key={line.id} className="even:bg-[#fafcfb]">
                <td className="border-b border-[#dfe5e1] px-1.5 py-2 align-top text-[#8a958f]">{index + 1}</td>
                <td className="border-b border-[#dfe5e1] px-1.5 py-2 align-top font-medium">{line.description}</td>
                <td className="border-b border-[#dfe5e1] px-1.5 py-2 align-top">
                  {line.unit || "—"}
                  {line.unit_code ? <span className="block text-[#64716a]">{line.unit_code}</span> : null}
                </td>
                <td className="border-b border-[#dfe5e1] px-1.5 py-2 text-right align-top">{line.quantity}</td>
                <td className="border-b border-[#dfe5e1] px-1.5 py-2 text-right align-top">
                  {money(line.unit_price_cents, currency)}
                  {isForeign && invoice.exchange_rate ? (
                    <span className="block text-[9px] text-[#8a958f]">
                      {money(Math.round(line.unit_price_cents * Number(invoice.exchange_rate)), "RON")}
                    </span>
                  ) : null}
                </td>
                <td className="border-b border-[#dfe5e1] px-1.5 py-2 text-right align-top">
                  {Number(line.vat_rate)}%
                  <span className="block text-[#64716a]">{line.vat_category}</span>
                </td>
                <td className="border-b border-[#dfe5e1] px-1.5 py-2 text-right align-top font-bold">
                  {money(signed(line.total_cents), currency)}
                  {isForeign && invoice.exchange_rate ? (
                    <span className="block text-[9px] font-normal text-[#8a958f]">
                      {money(signed(Math.round(line.total_cents * Number(invoice.exchange_rate))), "RON")}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(240px,.96fr)] gap-5">
        <div>
          <SectionTitle name="vatBreakdown" bilingual={bilingual} />
          {invoice.vat_breakdown.map((group) => (
            <div key={`${group.vat_category}-${group.vat_rate}`} className="mt-1.5 border-l-[3px] border-[#16a34a] bg-[#f4f7f5] px-2.5 py-2">
              <strong>{group.vat_category} · {Number(group.vat_rate)}%</strong><br />
              {money(signed(group.taxable_cents), currency)} + {money(signed(group.vat_cents), currency)} {LABELS.vat[0]}
              {group.vat_exemption_code || group.vat_exemption_reason ? (
                <span className="block text-[#64716a]">
                  {[group.vat_exemption_code, group.vat_exemption_reason].filter(Boolean).join(" ")}
                </span>
              ) : null}
            </div>
          ))}
          {isForeign && invoice.exchange_rate ? (
            <div className="mt-3 rounded-md bg-[#eaf8ef] px-3 py-2.5 text-[#166534]">
              <strong>{LABELS.bnrRate[0]}</strong>
              {bilingual ? <span className="block text-[9px] text-[#8a958f]">{LABELS.bnrRate[1]}</span> : null}
              1 {currency} = {exchangeRate(invoice.exchange_rate)} RON
              {invoice.exchange_rate_day ? ` · ${date(invoice.exchange_rate_day)}` : ""}
            </div>
          ) : null}
        </div>
        <table className="h-fit w-full border-collapse tabular-nums">
          <tbody>
            <SummaryRow label={<LabelPair name="subtotal" bilingual={bilingual} />} value={money(invoice.signed_subtotal_cents ?? signed(invoice.subtotal_cents), currency)} />
            <SummaryRow label={<LabelPair name="totalVat" bilingual={bilingual} />} value={money(invoice.signed_vat_cents ?? signed(invoice.vat_cents), currency)} />
            <SummaryRow label={<LabelPair name={invoice.financial_direction === "credit" ? "creditGranted" : "totalDue"} bilingual={bilingual} />} value={money(invoice.signed_total_cents ?? signed(invoice.total_cents), currency)} grand />
            {isForeign ? (
              <>
                <SummaryRow label={<><LabelPair name="subtotal" bilingual={bilingual} /> RON</>} value={money(invoice.signed_subtotal_cents_ron ?? signed(invoice.subtotal_cents_ron), "RON")} ronStart />
                <SummaryRow label={<><LabelPair name="totalVat" bilingual={bilingual} /> RON</>} value={money(invoice.signed_vat_cents_ron ?? signed(invoice.vat_cents_ron), "RON")} />
                <SummaryRow label={<LabelPair name="ronEquivalent" bilingual={bilingual} />} value={money(invoice.signed_total_cents_ron ?? signed(invoice.total_cents_ron), "RON")} strong />
              </>
            ) : null}
          </tbody>
        </table>
      </section>

      {(invoice.bank_accounts_snapshot?.length ?? 0) > 0 ? (
        <section className="mt-5">
          <SectionTitle name="bankAccounts" bilingual={bilingual} />
          <div className="grid gap-1.5 sm:grid-cols-2">
            {invoice.bank_accounts_snapshot.map((bank, index) => (
              <div key={`${bank.bank_name}-${index}`} className="rounded-md border border-[#dfe5e1] px-2.5 py-2">
                <strong>{bank.bank_name}</strong>
                {bank.currency_code ? <span className="text-[#64716a]"> · {bank.currency_code}</span> : null}
                <span className="block">{bankAccountLine(bank)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {invoice.notes ? (
        <section className="mt-5 whitespace-pre-line">
          <SectionTitle name="notes" bilingual={bilingual} />
          {invoice.notes}
        </section>
      ) : null}
      {invoice.adjustment_description ? <section className="mt-5 whitespace-pre-line"><SectionTitle name="adjustment" bilingual={bilingual} />{invoice.adjustment_description}</section> : null}

      <footer className="mt-6 border-t border-[#dfe5e1] pt-2.5 text-[9px] text-[#64716a]">
        <div>Factura este valabilă fără semnătură și ștampilă, conform art. 319 alin. (29) din Legea nr. 227/2015 privind Codul fiscal.</div>
        {bilingual ? (
          <div className="mt-1 text-[#8a958f]">
            This invoice is valid without a signature or stamp under Romanian Fiscal Code, Law 227/2015, article 319(29).
          </div>
        ) : null}
      </footer>
    </article>
  );
}

function SummaryRow({label, value, grand = false, strong = false, ronStart = false}: {
  label: ReactNode;
  value: string;
  grand?: boolean;
  strong?: boolean;
  ronStart?: boolean;
}) {
  return (
    <tr className={grand ? "text-[13px] font-extrabold" : strong ? "font-bold" : ""}>
      <td className={`border-b px-0.5 py-1.5 ${grand ? "border-y-[#17211b] border-t-2 py-2" : ronStart ? "border-[#dfe5e1] border-t pt-2" : "border-[#dfe5e1]"}`}>
        {label}
      </td>
      <td className={`border-b px-0.5 py-1.5 text-right ${grand ? "border-y-[#17211b] border-t-2 py-2" : ronStart ? "border-[#dfe5e1] border-t pt-2" : "border-[#dfe5e1]"}`}>
        {value}
      </td>
    </tr>
  );
}
