import {endOfMonth, parseDate, startOfMonth, today} from '@internationalized/date';
import {api, listQuery, type ListParams} from './api';
import type {Customer, Invoice} from './types';

export const MAX_PDF_EXPORT = 200;
export type InvoicePdfExport = {
  id: string; status: 'queued' | 'processing' | 'ready' | 'failed'; document_count: number;
  filename: string; expires_at: string; failure: string | null;
};

export function validInvoiceDate(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  try { return parseDate(value).toString() === value ? value : ''; } catch { return ''; }
}

export function invoiceMonth(offset: number): {issue_from: string; issue_to: string} {
  const month = today('Europe/Bucharest').add({months: offset});
  return {issue_from: startOfMonth(month).toString(), issue_to: endOfMonth(month).toString()};
}

export async function loadInvoiceCustomers(companyId: string, signal: AbortSignal): Promise<Customer[]> {
  const customers: Customer[] = [];
  for (let page = 1; ; page++) {
    const response = await api<Customer[]>(`/companies/${companyId}/customers${listQuery({page, perPage: 100, sort: 'name'})}`, {signal});
    customers.push(...response.data);
    if (page >= (response.meta?.pagination?.last_page ?? 1)) return customers;
  }
}

export async function loadFilteredInvoices(companyId: string, params: ListParams, signal: AbortSignal): Promise<Invoice[]> {
  const invoices: Invoice[] = [];
  for (let page = 1; ; page++) {
    const response = await api<Invoice[]>(`/companies/${companyId}/invoices${listQuery({...params, filter: {...params.filter, status: 'issued'}, page, perPage: 100})}`, {signal});
    if ((response.meta?.pagination?.total ?? 0) > MAX_PDF_EXPORT || invoices.length + response.data.length > MAX_PDF_EXPORT) {
      throw new Error(`Poți exporta maximum ${MAX_PDF_EXPORT} de documente. Restrânge perioada sau selectează individual.`);
    }
    invoices.push(...response.data);
    if (page >= (response.meta?.pagination?.last_page ?? 1)) return invoices;
  }
}
