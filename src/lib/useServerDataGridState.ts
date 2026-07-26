import {useCallback, useMemo} from "react";
import {useSearchParams} from "react-router";
import type {DataGridSortDescriptor} from "@heroui-pro/react/data-grid";
import {useDebouncedValue} from "./useDebouncedValue";

type FilterConfig<TFilter extends string> = {
  param: string;
  defaultValue: TFilter;
  values: readonly TFilter[];
};

type Options<TFilter extends string> = {
  defaultSort: DataGridSortDescriptor;
  sortColumns: readonly string[];
  filter?: FilterConfig<TFilter>;
  extraParams?: readonly string[];
};

function descriptorValue(descriptor: DataGridSortDescriptor): string {
  return `${descriptor.direction === "descending" ? "-" : ""}${String(descriptor.column)}`;
}

export function useServerDataGridState<TFilter extends string = never>({
  defaultSort,
  sortColumns,
  filter: filterConfig,
  extraParams = [],
}: Options<TFilter>) {
  const [params, setParams] = useSearchParams();

  const rawPage = Number(params.get("page"));
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const search = params.get("q") ?? "";
  const debouncedSearch = useDebouncedValue(search.trim());

  const sort = useMemo<DataGridSortDescriptor>(() => {
    const raw = params.get("sort");
    if (!raw) return defaultSort;
    const column = raw.startsWith("-") ? raw.slice(1) : raw;
    if (!sortColumns.includes(column)) return defaultSort;
    return {column, direction: raw.startsWith("-") ? "descending" : "ascending"};
  }, [defaultSort, params, sortColumns]);

  const filter = useMemo<TFilter | undefined>(() => {
    if (!filterConfig) return undefined;
    const raw = params.get(filterConfig.param) as TFilter | null;
    return raw && filterConfig.values.includes(raw) ? raw : filterConfig.defaultValue;
  }, [filterConfig, params]);

  const updateParams = useCallback(
    (update: (next: URLSearchParams) => void, replace = false) => {
      const next = new URLSearchParams(params);
      update(next);
      setParams(next, {replace});
    },
    [params, setParams],
  );

  const setPage = useCallback(
    (nextPage: number) =>
      updateParams((next) => {
        if (nextPage <= 1) next.delete("page");
        else next.set("page", String(nextPage));
      }),
    [updateParams],
  );

  const setSearch = useCallback(
    (value: string) =>
      updateParams(
        (next) => {
          if (value) next.set("q", value);
          else next.delete("q");
          next.delete("page");
        },
        true,
      ),
    [updateParams],
  );

  const setSort = useCallback(
    (descriptor: DataGridSortDescriptor) =>
      updateParams((next) => {
        const value = descriptorValue(descriptor);
        if (value === descriptorValue(defaultSort)) next.delete("sort");
        else next.set("sort", value);
        next.delete("page");
      }),
    [defaultSort, updateParams],
  );

  const setFilter = useCallback(
    (value: TFilter) => {
      if (!filterConfig) return;
      updateParams((next) => {
        if (value === filterConfig.defaultValue) next.delete(filterConfig.param);
        else next.set(filterConfig.param, value);
        next.delete("page");
      });
    },
    [filterConfig, updateParams],
  );

  const reset = useCallback(() => {
    updateParams((next) => {
      next.delete("page");
      next.delete("q");
      next.delete("sort");
      if (filterConfig) next.delete(filterConfig.param);
      for (const param of extraParams) next.delete(param);
    });
  }, [extraParams, filterConfig, updateParams]);

  const isDirty =
    page !== 1 ||
    search !== "" ||
    descriptorValue(sort) !== descriptorValue(defaultSort) ||
    Boolean(filterConfig && filter !== filterConfig.defaultValue) ||
    extraParams.some((param) => params.has(param));

  return {
    apiSort: descriptorValue(sort),
    debouncedSearch,
    filter,
    isDirty,
    page,
    reset,
    search,
    setFilter,
    setPage,
    setSearch,
    setSort,
    sort,
  };
}
