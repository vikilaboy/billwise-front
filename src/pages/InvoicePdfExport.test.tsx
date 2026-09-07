import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {InvoicesPage} from './InvoicesPage';
import {invoiceMonth, loadFilteredInvoices, validInvoiceDate} from '../lib/invoiceExport';

vi.mock('../components/AppShell', () => ({useCompany: () => ({company: {id: 'company-1'}})}));
const invoice = {id: 'invoice-1', formatted_number: 'VNE00145', customer: {name: 'Primehire LLC'}, status: 'issued', document_type: 'invoice',
  payment_status: 'paid', issue_date: '2026-08-12', due_date: '2026-08-31', currency: 'RON', total_cents: 10000, signed_total_cents: 10000, balance_cents: 0};
function response(data: unknown, total = 1) { return new Response(JSON.stringify({data, meta: {pagination: {current_page: 1, last_page: 1, per_page: 20, total}}}), {headers: {'Content-Type': 'application/json'}}); }
function setup(rows = [invoice], initial = '/facturi', pendingCurrent?: Promise<Response>) {
  const requests: Array<{url: string; init?: RequestInit}> = [];
  const fetchMock = vi.fn().mockImplementation((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input); requests.push({url, init});
    if (url.includes('/customers?')) return Promise.resolve(response([{id: 'customer-1', name: 'Primehire LLC'}]));
    if (url.endsWith('/invoice-pdf-exports/current')) return pendingCurrent ?? Promise.resolve(response(null));
    if (url.endsWith('/invoice-pdf-exports') && init?.method === 'POST') return Promise.resolve(response({id: 'export-1', status: 'queued', document_count: rows.length, filename: 'facturi.zip'}));
    return Promise.resolve(response(new URL(url, 'https://test.local').searchParams.get('_filter[status]') === 'issued' ? rows.filter((row) => row.status === 'issued') : rows));
  });
  vi.stubGlobal('fetch', fetchMock);
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[initial]}><InvoicesPage /></MemoryRouter></QueryClientProvider>);
  return {requests, client};
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('Invoice filters and PDF export', () => {
  it('rejects malformed URL periods instead of silently exporting all dates', async () => {
    const {requests} = setup([invoice], '/facturi?issue_from=2026-02-30');
    expect(await screen.findByRole('alert')).toHaveTextContent('dată invalidă');
    expect(screen.getByRole('button', {name: 'Exportă CSV'})).toBeDisabled();
    expect(requests.some((request) => request.url.includes('/invoices?'))).toBe(false);
    fireEvent.click(screen.getByRole('button', {name: 'Resetează'}));
    expect(await screen.findByLabelText('Selectează VNE00145')).toBeEnabled();
  });
  it('blocks stale rows and CSV while search debounce is pending', async () => {
    setup();
    const checkbox = await screen.findByLabelText('Selectează VNE00145');
    await waitFor(() => expect(checkbox).toBeEnabled());
    fireEvent.change(screen.getByPlaceholderText('Caută după număr…'), {target: {value: 'VNE00146'}});
    expect(checkbox).toBeDisabled();
    expect(screen.getByRole('button', {name: 'Exportă CSV'})).toBeDisabled();
  });
  it('select all for PDF excludes drafts from the same month', async () => {
    const {requests} = setup([invoice, {...invoice, id: 'draft-1', formatted_number: 'DRAFT', status: 'draft'}]);
    fireEvent.click(await screen.findByLabelText('Selectează DRAFT'));
    fireEvent.click(await screen.findByRole('button', {name: 'Selectează toate documentele emise pentru PDF'}));
    await waitFor(() => expect(screen.getByRole('button', {name: 'Exportă PDF-urile selectate'})).toBeEnabled());
    fireEvent.click(screen.getByRole('button', {name: 'Exportă PDF-urile selectate'}));
    await waitFor(() => expect(requests.find((request) => request.init?.method === 'POST')?.init?.body).toBe(JSON.stringify({invoice_ids: ['invoice-1']})));
  });
  it('late current-export responses cannot overwrite the newly queued export', async () => {
    let resolveCurrent!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => { resolveCurrent = resolve; });
    const {client} = setup([invoice], '/facturi', pending);
    fireEvent.click(await screen.findByLabelText('Selectează VNE00145'));
    fireEvent.click(await screen.findByRole('button', {name: 'Exportă PDF-urile selectate'}));
    expect(await screen.findByText(/Se pregătesc 1 PDF-uri/)).toBeInTheDocument();
    resolveCurrent(response(null));
    await waitFor(() => expect(client.getQueryData<{data: {id: string}}>(['invoice-pdf-export', 'company-1'])?.data.id).toBe('export-1'));
    expect(screen.getByText(/Se pregătesc 1 PDF-uri/)).toBeInTheDocument();
  });
  it('exports paid invoices by exact selected IDs and shows background preparation', async () => {
    const {requests} = setup();
    fireEvent.click(await screen.findByLabelText('Selectează VNE00145'));
    const exportButton = await screen.findByRole('button', {name: 'Exportă PDF-urile selectate'});
    await waitFor(() => expect(exportButton).toBeEnabled());
    fireEvent.click(exportButton);
    await waitFor(() => expect(requests.find((request) => request.init?.method === 'POST')?.init?.body).toBe(JSON.stringify({invoice_ids: ['invoice-1']})));
    expect(await screen.findByText(/Se pregătesc 1 PDF-uri/)).toBeInTheDocument();
  });
  it('explains why a draft selection cannot be exported', async () => {
    setup([{...invoice, status: 'draft'}]);
    fireEvent.click(await screen.findByLabelText('Selectează VNE00145'));
    expect(await screen.findByRole('button', {name: 'Exportă PDF-urile selectate'})).toBeDisabled();
    expect(screen.getByText('Exportul PDF acceptă doar documente emise. Elimină ciornele și documentele anulate din selecție.')).toBeInTheDocument();
  });
  it('combines customer and inclusive dates from the URL, resets page with month shortcut, and clears filters', async () => {
    const {requests} = setup([invoice], '/facturi?page=4&customer_id=customer-1&issue_from=2026-08-01&issue_to=2026-08-31');
    await screen.findByLabelText('Selectează VNE00145');
    const listRequests = () => requests.filter((request) => request.url.includes('/invoices?'));
    let query = new URL(listRequests()[0].url, 'https://test.local').searchParams;
    expect(query.get('_filter[customer_id]')).toBe('customer-1');
    expect(query.get('_filter[issue_date][gte]')).toBe('2026-08-01');
    expect(query.get('_filter[issue_date][lte]')).toBe('2026-08-31');
    fireEvent.click(screen.getByRole('button', {name: 'Luna trecută'}));
    await waitFor(() => expect(new URL(listRequests().at(-1)!.url, 'https://test.local').searchParams.get('_page')).toBe('1'));
    query = new URL(listRequests().at(-1)!.url, 'https://test.local').searchParams;
    expect(query.get('_filter[issue_date][gte]')).toBe(invoiceMonth(-1).issue_from);
    fireEvent.click(screen.getByRole('button', {name: 'Resetează'}));
    await waitFor(() => expect(listRequests().at(-1)!.url).not.toContain('customer_id'));
    expect(listRequests().at(-1)!.url).not.toContain('issue_date%5D');
  });
  it('reads every result page for select all and enforces the export limit', async () => {
    const fetchMock = vi.fn().mockImplementation((input: string | URL | Request) => {
      const page = new URL(String(input), 'https://test.local').searchParams.get('_page');
      return Promise.resolve(new Response(JSON.stringify({data: [{...invoice, id: page}], meta: {pagination: {last_page: 2, total: 2}}}), {headers: {'Content-Type': 'application/json'}}));
    });
    vi.stubGlobal('fetch', fetchMock);
    expect((await loadFilteredInvoices('company-1', {}, new AbortController().signal)).map((row) => row.id)).toEqual(['1', '2']);
    fetchMock.mockImplementation(() => Promise.resolve(response([], 201)));
    await expect(loadFilteredInvoices('company-1', {}, new AbortController().signal)).rejects.toThrow('maximum 200');
    expect(validInvoiceDate('2026-02-30')).toBe('');
    expect(validInvoiceDate('garbage')).toBe('');
  });
});
