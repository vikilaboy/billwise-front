import {Pagination} from "@heroui/react";
import type {Pagination as PaginationMeta} from "../lib/api";

type Props = {
  pagination?: PaginationMeta;
  onPageChange: (page: number) => void;
};

function pageRange(current: number, last: number): number[] {
  const start = Math.max(1, Math.min(current - 2, last - 4));
  const end = Math.min(last, start + 4);
  return Array.from({length: Math.max(0, end - start + 1)}, (_, index) => start + index);
}

export function DataTablePagination({pagination, onPageChange}: Props) {
  if (!pagination || pagination.total === 0) return null;

  const {current_page: current, last_page: last, per_page: perPage, total} = pagination;
  const first = (current - 1) * perPage + 1;
  const final = Math.min(current * perPage, total);

  return (
    <Pagination className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3">
      <Pagination.Summary className="text-xs text-[var(--text-muted)]">
        {first}–{final} din {total}
      </Pagination.Summary>
      <Pagination.Content>
        <Pagination.Item>
          <Pagination.Previous isDisabled={current <= 1} onPress={() => onPageChange(current - 1)}>
            Înapoi
          </Pagination.Previous>
        </Pagination.Item>
        {pageRange(current, last).map((page) => (
          <Pagination.Item key={page}>
            <Pagination.Link isActive={page === current} onPress={() => onPageChange(page)}>
              {page}
            </Pagination.Link>
          </Pagination.Item>
        ))}
        <Pagination.Item>
          <Pagination.Next isDisabled={current >= last} onPress={() => onPageChange(current + 1)}>
            Înainte
          </Pagination.Next>
        </Pagination.Item>
      </Pagination.Content>
    </Pagination>
  );
}
