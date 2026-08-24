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
}
