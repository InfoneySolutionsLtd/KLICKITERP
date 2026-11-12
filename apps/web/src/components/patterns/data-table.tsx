"use client";

import * as React from "react";
import {
  type ColumnDef,
  type PaginationState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Generic `@tanstack/react-table` wrapper, wired to the backend's real
 * pagination contract — `PaginationQueryDto`
 * (`packages/server/src/shared/pagination/pagination.dto.ts`, mirrored at
 * `@klickit/contracts`' `PaginationQueryDtoSchema`): `page` (1-based),
 * `pageSize`, `sortBy`, `sortDir: "ASC" | "DESC"`. When `serverPagination`
 * is supplied, this component is a pure presentational shell (no local
 * `getPaginationRowModel`) driving those exact field names straight from
 * its callbacks — the caller's TanStack Query hook owns the actual
 * page/sort state and refetches. Without it, falls back to client-side
 * pagination for a small, already-fully-loaded dataset (used by this
 * slice's own Top-Defaulters table, since `GET /dashboard/defaulters/top`
 * only accepts a `limit`, not full server-side pagination — this component
 * stays ready for a future paginated list endpoint to plug straight in).
 */
/**
 * Phase 6 Slice 2c — `pageSize` was declared here since Slice 1 but never
 * actually read anywhere in this component's body (confirmed by reading the
 * file before this pass); `onPageSizeChange` is new. `PAGE_SIZE_OPTIONS`
 * (10/25/50/100, defaulting to 10) is the real, fixed option set the plan
 * specifies — not configurable per-caller, since every current/near-term
 * caller of `serverPagination` wants the same set.
 */
export interface ServerPaginationState {
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  serverPagination?: ServerPaginationState;
  /**
   * Phase 6 Slice 13 Part 2 — optional, additive (every pre-existing caller
   * omits it and is unaffected). When supplied, each body row becomes a
   * real navigation target (`RolesPage`'s "row click -> /roles/[id]"
   * requirement) — cell content that shouldn't trigger it (e.g. an actions
   * column's dialog trigger) must stop the click from bubbling itself
   * (`onClick={(e) => e.stopPropagation()}` on that cell's wrapper), same
   * as any nested-interactive-element-inside-a-clickable-row pattern.
   */
  onRowClick?: (row: TData) => void;
  /**
   * Optional, additive. For a small, fully-loaded list with no server
   * pagination (e.g. Classes & Streams): render EVERY row inside a
   * height-capped, vertically scrolling area with a sticky header, instead of
   * paging it. Ignored when `serverPagination` is set.
   *
   * Without `serverPagination` and without this flag, the table pages
   * client-side with the same rows-per-page / previous / next controls the
   * server-paginated mode shows (see `PaginationControls`). That default is
   * what guarantees no caller can silently hide rows: this component used to
   * slice to TanStack's default page size of 10 but only drew pager controls
   * when `serverPagination` was supplied, so ~90 client-side lists showed
   * their first 10 rows and gave no way to reach the rest.
   */
  scrollable?: boolean;
}

/**
 * Rows-per-page selector + "Page X of Y" + previous/next. Shared by the
 * server-paginated mode (state owned by the caller's query hook) and the
 * client-paginated default (state owned by this component), so both look and
 * behave identically. Takes `ServerPaginationState`'s shape deliberately — it
 * is just "current page, size, page count and two change callbacks", nothing
 * server-specific.
 */
function PaginationControls({ page, pageSize, totalPages, onPageChange, onPageSizeChange }: ServerPaginationState) {
  const tCommon = useTranslations("common");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{tCommon("rowsPerPage")}</span>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger className="h-8 w-[72px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <span className="text-muted-foreground">{tCommon("page", { current: page, total: totalPages })}</span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="size-4" /> {tCommon("previous")}
        </Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          {tCommon("next")} <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function DataTable<TData, TValue>({ columns, data, serverPagination, onRowClick, scrollable }: DataTableProps<TData, TValue>) {
  const showAllRowsScrolling = !!scrollable && !serverPagination;
  const clientPaginated = !serverPagination && !showAllRowsScrolling;

  // Client-side paging state is held HERE (controlled), with TanStack's
  // `autoResetPageIndex` turned off. Its default behaviour resets to page 1
  // whenever the `data` array's identity changes — and many callers hand over
  // a fresh array on every render (an inline `.filter()`/`.map()`), which
  // would bounce the user straight back to page 1 the moment they click Next,
  // and after every refetch (an edit on page 3 would jump to page 1). The
  // effect below only clamps the page when the data shrinks underneath it
  // (e.g. deleting the last row of the last page).
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZE_OPTIONS[0] });

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    ...(clientPaginated
      ? { getPaginationRowModel: getPaginationRowModel(), onPaginationChange: setPagination, autoResetPageIndex: false, state: { pagination } }
      : {}),
    manualPagination: !!serverPagination,
  });

  const pageCount = table.getPageCount();
  React.useEffect(() => {
    if (clientPaginated && pageCount > 0 && pagination.pageIndex > pageCount - 1) {
      setPagination((prev) => ({ ...prev, pageIndex: pageCount - 1 }));
    }
  }, [clientPaginated, pageCount, pagination.pageIndex]);

  return (
    <div className="space-y-3">
      {/* Slice 1.5b (visual polish iteration): `rounded-md` -> `rounded-lg`
          (matching the button/input radius tier — Card is the only
          `rounded-xl` surface, and this table already sits nested inside a
          Card at every current call site, so `xl` here would double up).
          Plain `border-border` (not `/NN`-softened) — this app's colors are
          raw `var(--x)` custom properties, so Tailwind's opacity modifiers
          silently no-op on them (see query-boundary.tsx's doc comment on
          the same discovered limitation); `--border` is already a subtle
          token on its own. */}
      <div className="overflow-hidden rounded-lg border border-border">
        <Table containerClassName={showAllRowsScrolling ? "max-h-[28rem] overflow-y-auto" : undefined}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    // Sticky header cells need an OPAQUE background (`bg-card`,
                    // not the header band's `bg-muted/40` — `/NN` modifiers
                    // generate no CSS on this app's var() tokens) or rows
                    // scrolling underneath show through. The inset shadow
                    // stands in for the row's bottom border, which a sticky
                    // cell doesn't carry along while scrolling.
                    className={showAllRowsScrolling ? "sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_var(--border)]" : undefined}
                  >
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={onRowClick ? "cursor-pointer hover:bg-muted/50" : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {serverPagination && <PaginationControls {...serverPagination} />}

      {/* Client-side paging: only shown once the list is longer than the
          smallest page size — a pager on a 3-row table is just noise. Keyed on
          the TOTAL row count (not the current page's rows), so choosing a
          bigger page size never makes the controls vanish mid-use. */}
      {clientPaginated && data.length > PAGE_SIZE_OPTIONS[0] && (
        <PaginationControls
          page={pagination.pageIndex + 1}
          pageSize={pagination.pageSize}
          totalPages={Math.max(pageCount, 1)}
          onPageChange={(page) => table.setPageIndex(page - 1)}
          onPageSizeChange={(size) => table.setPagination({ pageIndex: 0, pageSize: size })}
        />
      )}
    </div>
  );
}
