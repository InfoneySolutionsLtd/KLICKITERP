import type { ComponentType } from "react";
import { WalletPicker } from "@/features/wallet/components/wallet-picker";
import { AcademicYearSelect } from "../components/param-fields/academic-year-select";
import { AccountSelect } from "../components/param-fields/account-select";
import { BankAccountSelect } from "../components/param-fields/bank-account-select";
import { CategorySelect } from "../components/param-fields/category-select";
import { DepreciationRunSelect } from "../components/param-fields/depreciation-run-select";
import { PayrollRunSelect } from "../components/param-fields/payroll-run-select";
import { PeriodSelect } from "../components/param-fields/period-select";
import { StockTakeSelect } from "../components/param-fields/stock-take-select";
import { StoreSelect } from "../components/param-fields/store-select";
import { SupplierSelect } from "../components/param-fields/supplier-select";
import { TermSelect } from "../components/param-fields/term-select";
import { TransportRouteSelect } from "../components/param-fields/transport-route-select";
import { UserSelect } from "../components/param-fields/user-select";
import { StudentParamField } from "../components/student-param-field";

export interface UuidParamFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * Maps a `"uuid"`-typed param KEY NAME (from `ReportDefinitionResponseDto.paramsShape`)
 * to a real entity-picker. Every distinct uuid param across all 30 reports
 * is covered here except `entityId` (Audit Log only) — deliberately absent:
 * it's a polymorphic FK whose real entity kind is only known via the
 * sibling `entityType` free-text param, so no single picker applies; it
 * falls back to a plain text input in `ReportParamsForm`. `bankAccountId`
 * (not `accountId`) and `depreciationRunId` (not `runId`) are deliberately
 * distinct key names from the two existing GL-account/payroll-run pickers
 * they'd otherwise collide with under this map's key-only matching.
 */
export const UUID_PARAM_PICKERS: Record<string, ComponentType<UuidParamFieldProps>> = {
  periodId: PeriodSelect,
  fromPeriodId: PeriodSelect,
  toPeriodId: PeriodSelect,
  accountId: AccountSelect,
  // NOTE: `categoryId` is only used by Expense Summary today. A future
  // report reusing this key name for a different "category" concept (e.g.
  // Inventory's own category.schema.ts) would collide under key-only
  // matching — not a problem yet, worth a look if that ever happens.
  categoryId: CategorySelect,
  runId: PayrollRunSelect,
  studentId: StudentParamField,
  supplierId: SupplierSelect,
  walletId: WalletPicker,
  actorId: UserSelect,
  termId: TermSelect,
  academicYearId: AcademicYearSelect,
  routeId: TransportRouteSelect,
  bankAccountId: BankAccountSelect,
  depreciationRunId: DepreciationRunSelect,
  storeId: StoreSelect,
  stockTakeId: StockTakeSelect,
};
