import {expect, test} from '@playwright/test';

test('monthly invoice filters, cross-page selection and ZIP download', async ({page}, testInfo) => {
  const user = {id: 'user-1', name: 'Owner Test', email: 'owner@example.test', email_verified_at: '2026-08-01T00:00:00Z', tenant: {id: 'tenant-1', name: 'Test', slug: 'test'}, roles: [], permissions: []};
  const invoices = Array.from({length: 22}, (_, index) => ({
    id: `invoice-${index + 1}`, formatted_number: `VNE00${145 + index}`, customer: {id: 'customer-1', name: 'Primehire LLC'},
    status: index === 21 ? 'draft' : 'issued', document_type: 'invoice', payment_status: 'paid', financial_direction: 'debit',
    issue_date: '2026-08-12', due_date: '2026-08-31', currency: 'RON', total_cents: 120000, signed_total_cents: 120000, paid_cents: 120000, balance_cents: 0,
  }));
  let selected: string[] = [];
  let current: object | null = null;
  await page.route('**/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let data: unknown = [];
    if (path.endsWith('/session/csrf')) data = {csrf_token: 'test-token'};
    else if (path.endsWith('/session/me')) data = {status: 'authenticated', user};
    else if (path.endsWith('/me')) data = user;
    else if (path.endsWith('/companies')) data = [{id: 'company-1', legal_name: 'Billwise Demo SRL', tax_id: '12345674', archived_at: null}];
    else if (path.endsWith('/customers')) data = [{id: 'customer-1', name: 'Primehire LLC'}];
    else if (path.endsWith('/invoice-pdf-exports/current')) {
      if (current) current = {...current, status: 'ready'};
      data = current;
    }
    else if (path.endsWith('/invoice-pdf-exports')) {
      selected = route.request().postDataJSON().invoice_ids;
      current = {id: 'export-1', status: 'queued', filename: 'facturi-2026-08.zip', document_count: selected.length, expires_at: '2026-09-14T00:00:00Z', failure: null};
      data = current;
    } else if (path.endsWith('/download')) {
      await route.fulfill({contentType: 'application/zip', headers: {'Content-Disposition': 'attachment; filename="facturi-2026-08.zip"'}, body: 'test-archive'});
      return;
    } else if (path.endsWith('/invoices')) {
      const currentPage = Number(url.searchParams.get('_page') ?? 1);
      const perPage = Number(url.searchParams.get('_per_page') ?? 20);
      const filtered = url.searchParams.get('_filter[status]') === 'issued' ? invoices.filter((invoice) => invoice.status === 'issued') : invoices;
      await route.fulfill({json: {data: filtered.slice((currentPage - 1) * perPage, currentPage * perPage), meta: {pagination: {current_page: currentPage, per_page: perPage, total: filtered.length, last_page: Math.ceil(filtered.length / perPage)}}}});
      return;
    }
    await route.fulfill({json: {data}});
  });
  await page.goto('/facturi');
  await expect(page.getByRole('checkbox', {name: /^Selectează VNE00145/})).toBeVisible();
  await page.getByRole('button', {name: /Filtrează după client/}).click();
  await page.getByRole('option', {name: 'Primehire LLC'}).click();
  await expect(page).toHaveURL(/customer_id=customer-1/);
  await page.getByRole('button', {name: 'Luna trecută'}).click();
  await expect(page).toHaveURL(/issue_from=/);
  await page.getByRole('row', {name: 'VNE00145', exact: true}).locator('[data-slot="checkbox-control"]').click();
  await expect(page.getByRole('checkbox', {name: /^Selectează VNE00145/})).toBeChecked();
  await page.getByText('Înainte', {exact: true}).click();
  await expect(page.getByRole('checkbox', {name: /^Selectează VNE00165/})).toBeVisible();
  await page.getByRole('row', {name: 'VNE00165', exact: true}).locator('[data-slot="checkbox-control"]').click();
  await expect(page.getByText('2 selectate', {exact: true})).toBeVisible();
  await page.getByRole('button', {name: /Selectează toate documentele emise pentru PDF/}).click();
  await expect(page.getByText('21 selectate', {exact: true})).toBeVisible();
  await page.screenshot({path: testInfo.outputPath('invoice-export-desktop.png'), fullPage: true});
  await page.getByRole('button', {name: 'Exportă PDF-urile selectate'}).click();
  await expect.poll(() => selected.length).toBe(21);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', {name: 'Descarcă arhiva ZIP'}).click();
  expect((await downloadEvent).suggestedFilename()).toBe('facturi-2026-08.zip');
  await page.setViewportSize({width: 390, height: 844});
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path: testInfo.outputPath('invoice-export-mobile.png'), fullPage: true});
  await page.getByRole('button', {name: 'Resetează'}).click();
  await expect(page).not.toHaveURL(/customer_id|issue_from|issue_to/);
  await expect(page.getByText('21 selectate', {exact: true})).toBeHidden();
});
