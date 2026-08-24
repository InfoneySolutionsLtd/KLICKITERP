import type { LogTransportExpenseDto, TransportExpenseResponseDto, TransportRouteSummaryDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `TransportExpensesController`
 * (`packages/server/src/domains/billing/api/transport-expenses.controller.ts`)
 * — logging/listing bus expenses (real `exp_voucher` rows) against a
 * transport route — and `TransportRoutesController.summary()`'s new
 * income-vs-expense read, permissions `billing:transport-expense:manage`/
 * `:view`.
 *
 * `LogTransportExpenseDto.payeeRef` degrades to the narrow `{} & {[x:string]:
 * undefined}` generated shape — `LogTransportExpenseDto`'s own
 * `@ApiProperty({ type: Object, description: "Polymorphic payee identity..."
 * })` decorator gives Swagger no structural shape to reflect for a
 * genuinely polymorphic field, the exact same gap
 * `features/expenses/api/vouchers.api.ts`'s own doc comment documents for
 * `CreateVoucherDto.payeeRef` — fixed the identical established way:
 * `LogTransportExpenseRequestBody` mirrors the generated (gapped) shape,
 * cast at the `apiClient.POST` boundary only.
 */
interface LogTransportExpenseRequestBody {
  payeeType: "SUPPLIER" | "STAFF" | "OTHER";
  payeeRef: Record<string, never>;
  amount: string;
  method: "CASH" | "BANK" | "PETTY_CASH" | "MPESA" | "CHEQUE";
  narrative: string;
}

export async function logTransportExpense(routeId: string, dto: LogTransportExpenseDto): Promise<TransportExpenseResponseDto> {
  return unwrapApiResult<TransportExpenseResponseDto>(
    await apiClient.POST("/api/v1/billing/transport-routes/{routeId}/expenses", {
      params: { path: { routeId } },
      body: dto as unknown as LogTransportExpenseRequestBody,
    }),
  );
}

export async function listTransportExpenses(routeId: string): Promise<TransportExpenseResponseDto[]> {
  return unwrapApiResult<TransportExpenseResponseDto[]>(
    await apiClient.GET("/api/v1/billing/transport-routes/{routeId}/expenses", { params: { path: { routeId } } }),
  );
}

export async function getTransportRouteSummary(routeId: string): Promise<TransportRouteSummaryDto> {
  return unwrapApiResult<TransportRouteSummaryDto>(
    await apiClient.GET("/api/v1/billing/transport-routes/{id}/summary", { params: { path: { id: routeId } } }),
  );
}
