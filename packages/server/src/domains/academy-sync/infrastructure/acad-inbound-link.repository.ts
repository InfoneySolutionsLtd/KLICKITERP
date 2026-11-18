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
   * Records that a correctly signed call arrived. A plain UPDATE (not read-modify-save) so concurrent inbound calls
   * never fight over the row's optimistic-lock version.
   */
  async touchInbound(at: Date): Promise<void> {
    await this.repo.createQueryBuilder().update().set({ lastInboundAt: at }).execute();
  }
}
