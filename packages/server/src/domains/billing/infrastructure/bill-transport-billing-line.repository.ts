import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { BillTransportBillingLineEntity } from "../domain/bill-transport-billing-line.entity";

@Injectable()
export class BillTransportBillingLineRepository {
  constructor(
    @InjectRepository(BillTransportBillingLineEntity)
    private readonly repo: Repository<BillTransportBillingLineEntity>,
  ) {}

  async create(data: Partial<BillTransportBillingLineEntity>, manager?: EntityManager): Promise<BillTransportBillingLineEntity> {
    const repo = manager?.getRepository(BillTransportBillingLineEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async listByRoute(routeId: string, manager?: EntityManager): Promise<BillTransportBillingLineEntity[]> {
    return (manager?.getRepository(BillTransportBillingLineEntity) ?? this.repo).find({ where: { routeId } });
  }

  /** Sum of the real `bill_invoice_line.amount` for every line billed against this route — the "income" half of the route's own summary. */
  async sumAmountByRoute(routeId: string, manager?: EntityManager): Promise<string> {
    const repo = manager?.getRepository(BillTransportBillingLineEntity) ?? this.repo;
    const rows: Array<{ total: string | null }> = await repo
      .createQueryBuilder("btl")
      .innerJoin("btl.invoiceLine", "line")
      .select("SUM(line.amount)", "total")
      .where("btl.route_id = :routeId", { routeId })
      .getRawMany();
    return rows[0]?.total ?? "0";
  }

  /**
   * "Regenerate like previous term" (`TransportBillingService.
   * regenerateLikePreviousTerm()`) — every real (non-VOID) transport billing
   * line for a given term, joined through to the parent invoice to filter by
   * `term_id`/`status` (this entity carries no `term_id` of its own). Used
   * for BOTH lookups that method needs: the preceding term's billed
   * students+routes (optionally narrowed to one route), and the target
   * term's already-billed student set (no route filter) for the duplicate
   * guard. "Most recent row per student" is reduced in the SERVICE, in JS —
   * same simple-reduction convention `bulk-billing.service.ts`'s own
   * `categoryCache` already establishes, rather than a SQL `DISTINCT ON`.
   */
  async listByTermAndOptionalRoute(
    termId: string,
    routeId: string | undefined,
    manager?: EntityManager,
  ): Promise<{ studentId: string; routeId: string; createdAt: Date }[]> {
    const repo = manager?.getRepository(BillTransportBillingLineEntity) ?? this.repo;
    const qb = repo
      .createQueryBuilder("btl")
      .innerJoin("btl.invoiceLine", "line")
      .innerJoin("line.invoice", "invoice")
      .select(["btl.studentId AS \"studentId\"", "btl.routeId AS \"routeId\"", "btl.createdAt AS \"createdAt\""])
      .where("invoice.termId = :termId", { termId })
      .andWhere("invoice.status <> 'VOID'");
    if (routeId) qb.andWhere("btl.routeId = :routeId", { routeId });
    return qb.getRawMany();
  }
}
