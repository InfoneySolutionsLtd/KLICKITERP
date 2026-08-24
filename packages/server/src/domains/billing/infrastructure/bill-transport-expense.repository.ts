import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { BillTransportExpenseEntity } from "../domain/bill-transport-expense.entity";

@Injectable()
export class BillTransportExpenseRepository {
  constructor(
    @InjectRepository(BillTransportExpenseEntity)
    private readonly repo: Repository<BillTransportExpenseEntity>,
  ) {}

  async create(data: Partial<BillTransportExpenseEntity>, manager?: EntityManager): Promise<BillTransportExpenseEntity> {
    const repo = manager?.getRepository(BillTransportExpenseEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async listByRoute(routeId: string, manager?: EntityManager): Promise<BillTransportExpenseEntity[]> {
    return (manager?.getRepository(BillTransportExpenseEntity) ?? this.repo).find({
      where: { routeId },
      relations: { voucher: true },
      order: { createdAt: "DESC" },
    });
  }

  /** Sum of the real `exp_voucher.amount` for every voucher logged against this route — the "expense" half of the route's own summary. */
  async sumAmountByRoute(routeId: string, manager?: EntityManager): Promise<string> {
    const repo = manager?.getRepository(BillTransportExpenseEntity) ?? this.repo;
    const rows: Array<{ total: string | null }> = await repo
      .createQueryBuilder("bte")
      .innerJoin("bte.voucher", "voucher")
      .select("SUM(voucher.amount)", "total")
      .where("bte.route_id = :routeId", { routeId })
      .getRawMany();
    return rows[0]?.total ?? "0";
  }
}
