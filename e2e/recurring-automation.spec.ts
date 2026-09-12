import {expect, test} from '@playwright/test';

test('locked recurring automation is editable without a billing version on desktop and mobile', async ({page}, testInfo) => {
  const user = {id: 'user-1', name: 'Owner Test', email: 'owner@example.test', email_verified_at: '2026-08-01T00:00:00Z', tenant: {id: 'tenant-1', name: 'Test', slug: 'test'}, roles: [], permissions: []};
  let template = {id: 'recurring-1', name: 'Abonament lunar', company_profile_id: 'company-1',
    status: 'active', is_locked: true, auto_issue: false, notification_emails: ['contabil@example.com'],
    next_run_at: '2026-10-01T06:00:00Z', frequency: 'monthly', timezone: 'Europe/Bucharest',
    customer: {id: 'customer-1', name: 'Client Demo'}, runs: []};
  const mutations: Array<{path: string; body: unknown}> = [];
  await page.route('**/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith('/session/csrf')) data = {csrf_token: 'test-token'};
    else if (path.endsWith('/session/me')) data = {status: 'authenticated', user};
    else if (path.endsWith('/me')) data = user;
    else if (path.endsWith('/companies')) data = [{id: 'company-1', legal_name: 'Billwise Demo SRL', tax_id: '12345674', archived_at: null}];
    else if (path.endsWith('/automation')) {
      const body = route.request().postDataJSON();
      mutations.push({path, body});
      template = {...template, ...body};
      data = template;
    } else if (path.endsWith('/recurring-invoices')) data = [template];
    await route.fulfill({json: {data}});
  });
  await page.goto('/recurente');
  await page.getByRole('button', {name: 'Automatizare', exact: true}).click();
  await expect(page.getByText('Setările se salvează pe aceeași recurență, fără o versiune nouă.')).toBeVisible();
  await page.getByText('Emite automat factura', {exact: true}).click();
  await expect(page.getByRole('checkbox', {name: 'Emite automat factura'})).toBeChecked();
  await page.getByRole('textbox', {name: 'Adrese de email pentru notificări'}).fill('contabil@example.com\ncoleg@example.com');
  await page.screenshot({path: testInfo.outputPath('recurring-automation-desktop.png'), fullPage: true, animations: 'disabled'});
  await page.getByRole('button', {name: 'Salvează setările'}).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(mutations).toEqual([{path: '/v1/companies/company-1/recurring-invoices/recurring-1/automation', body: {auto_issue: true, notification_emails: ['contabil@example.com', 'coleg@example.com']}}]);
  await expect(page.getByText('Emitere automată', {exact: true})).toBeVisible();
  await page.setViewportSize({width: 390, height: 844});
  await page.getByRole('button', {name: 'Automatizare', exact: true}).click();
  await expect(page.getByRole('checkbox', {name: 'Emite automat factura'})).toBeChecked();
  await expect(page.getByRole('textbox', {name: 'Adrese de email pentru notificări'})).toHaveValue('contabil@example.com\ncoleg@example.com');
  const bounds = await page.getByRole('button', {name: 'Salvează setările'}).boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  await page.screenshot({path: testInfo.outputPath('recurring-automation-mobile.png'), fullPage: true, animations: 'disabled'});
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});
