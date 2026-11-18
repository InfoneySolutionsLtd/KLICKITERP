import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AcadInboundLinkEntity } from "../domain/acad-inbound-link.entity";

@Injectable()
export class AcadInboundLinkRepository {
  constructor(
    @InjectRepository(AcadInboundLinkEntity)
    private readonly repo: Repository<AcadInboundLinkEntity>,
  ) {}

  async findCurrent(): Promise<AcadInboundLinkEntity | null> {
    return this.repo.findOne({ where: {} });
  }

  async save(entity: AcadInboundLinkEntity): Promise<AcadInboundLinkEntity> {
    return this.repo.save(entity);
  }

  async create(data: Partial<AcadInboundLinkEntity>): Promise<AcadInboundLinkEntity> {
    return this.repo.save(this.repo.create({ singleton: true, ...data }));
  }

  /**
   * Stores the outcome of a connection test. A targeted UPDATE of just those columns: `save()` would also write back the
   * (by then stale) `last_inbound_at` it loaded before the test — and the test itself makes the Academy call us, which
   * updates that column in between.
   */
  async recordVerification(ok: boolean, message: string, at: Date, actorId: string | null): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update()
      .set({ lastVerifiedAt: at, lastVerifyOk: ok, lastVerifyMessage: message, updatedBy: actorId })
      .execute();
  }

  /**
   * Records that a correctly signed call arrived. A plain UPDATE (not read-modify-save) so concurrent inbound calls
   * never fight over the row's optimistic-lock version.
   */
  async touchInbound(at: Date): Promise<void> {
    await this.repo.createQueryBuilder().update().set({ lastInboundAt: at }).execute();
  }
}
