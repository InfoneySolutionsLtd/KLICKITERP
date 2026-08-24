"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { RefundVoucherResponseDto } from "@klickit/contracts";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";
import { RefundVoucherStatusBadge } from "./status-badges";
import { RefundVoucherStatusActions } from "./refund-voucher-status-actions";

/**
 * Part 6 (Billing sub-features batch) — `GET /billing/refund-vouchers?studentId=`,
 * read-only listing + inline `RefundVoucherStatusActions` per row, rendered
 * on the student detail page's own "Refund Vouchers" Card
 * (`app/(erp)/students/[id]/page.tsx`), matching `DebitNotesTable`'s own
 * student-scoped-list shape. No standalone detail route exists for a single
 * refund voucher in this pass — every action its lifecycle needs happens
 * inline here.
 *
 * The `journalId`-present indicator column surfaces, at a glance, whether the
 * P-12 GL journal has actually been posted for this voucher yet (only true
 * from `APPROVED_UNPAID` onward) — useful specifically alongside a
 * `CANCELLED` status, since `RefundVouchersService.cancel()` never reverses
 * that journal once it exists (see `refund-vouchers.api.ts`'s own doc
 * comment) — a cancelled voucher that still shows a journal indicator is
 * exactly the documented gap made visible, not a bug.
 */
export function RefundVouchersTable({
  vouchers,
  studentId,
}: {
  vouchers: RefundVoucherResponseDto[];
  studentId: string | undefined;
}) {
  const t = useTranslations("billing.refundVouchers.table");
  const tMethod = useTranslations("billing.refundVouchers.methodValues");
  const tCommon = useTranslations("common");

  const columns = React.useMemo<ColumnDef<RefundVoucherResponseDto>[]>(
    () => [
      { accessorKey: "number", header: t("number") },
      {
        id: "status",
        header: t("status"),
        cell: ({ row }) => <RefundVoucherStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "amount",
        header: t("amount"),
        cell: ({ getValue }) => formatMoney(getValue<string>()),
      },
      {
        id: "method",
        header: t("method"),
        cell: ({ row }) => tMethod(row.original.method),
      },
      {
        id: "journal",
        header: t("journal"),
        cell: ({ row }) => (row.original.journalId ? t("journalPosted") : t("journalNotPosted")),
      },
      {
        id: "actions",
        header: tCommon("actions"),
        cell: ({ row }) => <RefundVoucherStatusActions voucher={row.original} studentId={studentId} />,
      },
    ],
    [t, tMethod, tCommon, studentId],
  );

  return <DataTable columns={columns} data={vouchers} />;
}
