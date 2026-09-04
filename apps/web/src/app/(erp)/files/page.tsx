"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, Loader2, Search } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { FileObjectResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable, type ServerPaginationState } from "@/components/patterns/data-table";
import { ApiError } from "@/lib/api-error";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useFileSignedUrl, useFiles } from "@/features/files/hooks/use-files";
import { EMPTY_FILE_FILTERS, FileFilters, type FileFiltersValue } from "@/features/files/components/file-filters";
import { DeleteFileButton } from "@/features/files/components/delete-file-button";

const DEFAULT_PAGE_SIZE = 25;
const MIN_SEARCH_LENGTH = 2;
const BYTE_UNITS = ["B", "KB", "MB", "GB"] as const;

function formatBytes(value: string): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 B";
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${BYTE_UNITS[unitIndex]}`;
}

/**
 * A general-purpose, cross-entity file browser — every file uploaded
 * anywhere in the system, previously only reachable one `entityType`/
 * `entityId` pair at a time (every other screen's own inline attachment
 * widget). Mirrors `app/(erp)/users/page.tsx`'s exact server-paginated/
 * filtered/debounced-search shape. Deliberately no `/files/[id]` detail
 * route — every field fits one table row, matching Departments'/Delegations'
 * own "no standalone route when the parent screen already covers it"
 * convention. `uploadedBy` stays a raw id for this first pass — resolving it
 * to a display name would need a batched per-row user lookup, a natural
 * follow-up, not required here.
 */
export default function FilesPage() {
  const t = useTranslations("files.list");
  const tCommon = useTranslations("common");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);
  const [filters, setFilters] = React.useState<FileFiltersValue>(EMPTY_FILE_FILTERS);
  const [searchDraft, setSearchDraft] = React.useState("");
  const debouncedSearch = useDebouncedValue(searchDraft, 300);
  const trimmedSearch = debouncedSearch.trim();
  const q = trimmedSearch.length >= MIN_SEARCH_LENGTH ? trimmedSearch : undefined;

  const filesQuery = useFiles({
    page,
    pageSize,
    entityType: filters.entityType.trim() || undefined,
    entityId: filters.entityId.trim() || undefined,
    q,
  });
  const signedUrlMutation = useFileSignedUrl();
  const [openingId, setOpeningId] = React.useState<string | null>(null);
  const [openError, setOpenError] = React.useState<string | null>(null);

  // A filter or search change is a genuinely different result set — page 1 is always valid.
  React.useEffect(() => {
    setPage(1);
  }, [filters.entityType, filters.entityId, q]);

  async function handleOpen(file: FileObjectResponseDto) {
    setOpenError(null);
    setOpeningId(file.id);
    try {
      const signed = await signedUrlMutation.mutateAsync(file.id);
      window.open(signed.url, "_blank", "noreferrer");
    } catch (err) {
      setOpenError(err instanceof ApiError ? err.message : t("openError"));
    } finally {
      setOpeningId(null);
    }
  }

  const total = filesQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const serverPagination: ServerPaginationState = {
    page,
    pageSize,
    totalPages,
    onPageChange: setPage,
    onPageSizeChange: (newSize: number) => {
      setPageSize(newSize);
      setPage(1);
    },
  };

  const columns = React.useMemo<ColumnDef<FileObjectResponseDto>[]>(
    () => [
      {
        id: "originalName",
        header: t("columns.originalName"),
        cell: ({ row }) => (
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-left"
            onClick={() => void handleOpen(row.original)}
            disabled={openingId === row.original.id}
          >
            {openingId === row.original.id ? <Loader2 className="size-3 animate-spin" /> : <ExternalLink className="size-3" />}
            <span className="line-clamp-1">{row.original.originalName}</span>
          </Button>
        ),
      },
      { id: "entityType", header: t("columns.entityType"), cell: ({ row }) => row.original.entityType ?? "—" },
      {
        id: "entityId",
        header: t("columns.entityId"),
        cell: ({ row }) => (row.original.entityId ? `${row.original.entityId.slice(0, 8)}…` : "—"),
      },
      { id: "sizeBytes", header: t("columns.sizeBytes"), cell: ({ row }) => formatBytes(row.original.sizeBytes) },
      { accessorKey: "mime", header: t("columns.mime") },
      { id: "createdAt", header: t("columns.createdAt"), cell: ({ row }) => new Date(row.original.createdAt).toLocaleString() },
      {
        id: "actions",
        header: tCommon("actions"),
        cell: ({ row }) => <DeleteFileButton file={row.original} />,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, tCommon, openingId],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("filtersTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={t("searchPlaceholder")}
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
            />
          </div>
          <FileFilters value={filters} onChange={setFilters} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {openError && <p className="text-sm text-destructive">{openError}</p>}
          <QueryBoundary query={filesQuery} isEmpty={(d) => d.items.length === 0}>
            {(data) => <DataTable columns={columns} data={data.items} serverPagination={serverPagination} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
