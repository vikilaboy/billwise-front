import {act, renderHook} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import type {Invoice} from './types';
import {useInvoiceSelection} from './useInvoiceSelection';

const first = {id: 'one', status: 'issued'} as Invoice;
const second = {id: 'two', status: 'issued'} as Invoice;
describe('Invoice PDF selection', () => {
  it('retains refreshed balances and status when the invoice leaves the visible page', () => {
    const {result, rerender} = renderHook(({rows}) => useInvoiceSelection(rows, 'company1'), {initialProps: {rows: [{...first, balance_cents: 10000}]}});
    act(() => result.current.setSelectedIds(new Set(['one'])));
    rerender({rows: [{...first, balance_cents: 0}]});
    rerender({rows: [{...second, balance_cents: 500}]});
    expect(result.current.selectedRows[0].balance_cents).toBe(0);
  });
  it('retains selected invoices across pages and drops them on filter/company changes', () => {
    const {result, rerender} = renderHook(({rows, scope}) => useInvoiceSelection(rows, scope), {initialProps: {rows: [first], scope: 'company1:august'}});
    act(() => result.current.setSelectedIds(new Set(['one'])));
    rerender({rows: [second], scope: 'company1:august'});
    act(() => result.current.setSelectedIds((previous) => new Set([...previous, 'two'])));
    expect([...result.current.selectedIds]).toEqual(['one', 'two']);
    act(() => result.current.setSelectedIds((previous) => new Set([...previous].filter((id) => id !== 'two'))));
    expect([...result.current.selectedIds]).toEqual(['one']);
    rerender({rows: [second], scope: 'company1:september'});
    expect(result.current.selectedRows).toEqual([]);
    rerender({rows: [first], scope: 'company1:august'});
    expect(result.current.selectedRows).toEqual([]);
    act(() => result.current.selectRows([first, second]));
    rerender({rows: [first], scope: 'company2:august'});
    expect(result.current.selectedRows).toEqual([]);
  });
});
