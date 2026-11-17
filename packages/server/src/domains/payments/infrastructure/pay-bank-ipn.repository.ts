import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { PayBankIpnEntity, PayBankIpnKind, PayBankIpnProvider, PayBankIpnState } from "../domain/pay-bank-ipn.entity";

/** Postgres unique_violation. */
const PG_UNIQUE_VIOLATION = "23505";

@Injectable()
export class PayBankIpnRepository {
  constructor(
    @InjectRepository(PayBankIpnEntity)
    private readonly repo: Repository<PayBankIpnEntity>,
  ) {}

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<PayBankIpnEntity> {
    const row = await (manager?.getRepository(PayBankIpnEntity) ?? this.repo).findOne({ where: { id } });
    if (!row) throw new NotFoundException("PayBankIpn", id);
    return row;
  }

  /** The row for a bank's own transaction id — the idempotency lookup. */
  async findByExternalRef(provider: PayBankIpnProvider, kind: PayBankIpnKind, externalRef: string, manager?: EntityManager): Promise<PayBankIpnEntity | null> {
    return (manager?.getRepository(PayBankIpnEntity) ?? this.repo).findOne({ where: { provider, kind, externalRef } });
  }

  /** Same lookup, taking a row lock so two deliveries of one notification cannot both finish processing it. */
  async findByExternalRefForUpdate(provider: PayBankIpnProvider, kind: PayBankIpnKind, externalRef: string, manager: EntityManager): Promise<PayBankIpnEntity | null> {
    return manager.getRepository(PayBankIpnEntity).findOne({ where: { provider, kind, externalRef }, lock: { mode: "pessimistic_write" } });
  }

  /** Newest first, with optional state / kind / free-text filters. */
  async findPaginated(
    filters: { state?: PayBankIpnState; kind?: PayBankIpnKind; q?: string },
    pagination: { skip: number; take: number },
  ): Promise<{ items: PayBankIpnEntity[]; total: number }> {
    const qb = this.repo.createQueryBuilder("ipn");
    if (filters.state) qb.andWhere("ipn.state = :state", { state: filters.state });
    if (filters.kind) qb.andWhere("ipn.kind = :kind", { kind: filters.kind });
    const q = filters.q?.trim();
    if (q) {
      qb.andWhere("(ipn.external_ref ILIKE :q OR ipn.customer_reference ILIKE :q OR ipn.payer_name ILIKE :q)", { q: `%${q}%` });
    }
    qb.orderBy("ipn.createdAt", "DESC").skip(pagination.skip).take(pagination.take);
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async create(data: Partial<PayBankIpnEntity>, manager?: EntityManager): Promise<PayBankIpnEntity> {
    const repo = manager?.getRepository(PayBankIpnEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: PayBankIpnEntity, manager?: EntityManager): Promise<PayBankIpnEntity> {
    return (manager?.getRepository(PayBankIpnEntity) ?? this.repo).save(entity);
  }
}

/** True when a save failed because another delivery of the same notification got there first. */
export function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string; driverError?: { code?: string } } | undefined);
  return code?.code === PG_UNIQUE_VIOLATION || code?.driverError?.code === PG_UNIQUE_VIOLATION;
}
