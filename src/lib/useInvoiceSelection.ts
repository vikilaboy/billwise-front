import {useCallback, useEffect, useMemo, useState, type SetStateAction} from 'react';
import type {Invoice} from './types';

export function useInvoiceSelection(rows: Invoice[], scope: string) {
  const [selection, setSelection] = useState<{scope: string; rows: Map<string, Invoice>}>({scope, rows: new Map()});
  useEffect(() => {
    setSelection((previous) => {
      if (previous.scope !== scope) return {scope, rows: new Map()};
      const updated = new Map(previous.rows);
      let changed = false;
      rows.forEach((row) => {
        if (updated.has(row.id) && updated.get(row.id) !== row) {
          updated.set(row.id, row);
          changed = true;
        }
      });
      return changed ? {scope, rows: updated} : previous;
    });
  }, [scope, rows]);
  const selectedRows = useMemo(() => selection.scope === scope
    ? [...selection.rows.values()].map((item) => rows.find((row) => row.id === item.id) ?? item) : [], [selection, scope, rows]);
  const selectedIds = useMemo(() => new Set(selectedRows.map((item) => item.id)), [selectedRows]);
  const setSelectedIds = useCallback((update: SetStateAction<Set<string>>) => {
    setSelection((previous) => {
      const known = new Map(previous.scope === scope ? previous.rows : []);
      rows.forEach((row) => known.set(row.id, row));
      const ids = typeof update === 'function' ? update(new Set(previous.scope === scope ? previous.rows.keys() : [])) : update;
      return {scope, rows: new Map([...ids].flatMap((id) => known.has(id) ? [[id, known.get(id)!] as const] : []))};
    });
  }, [scope, rows]);
  const selectRows = useCallback((items: Invoice[]) => setSelection({scope, rows: new Map(items.map((item) => [item.id, item]))}), [scope]);
  return {selectedRows, selectedIds, setSelectedIds, selectRows};
}
