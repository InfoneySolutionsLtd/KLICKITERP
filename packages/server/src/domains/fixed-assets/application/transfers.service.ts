import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { FaTransferEntity } from "../domain/fa-transfer.entity";
import { FaTransferRepository } from "../infrastructure/fa-transfer.repository";
import { FaAssetRepository } from "../infrastructure/fa-asset.repository";

export interface CreateFaTransferInput {
  assetId: string;
  toLocation: string;
  toCustodianUserId?: string | null;
}

/** Postgres check_violation SQLSTATE — see `maintenance.service.ts`'s own `PG_CHECK_VIOLATION` doc comment for the full BR-FA-02 story. */
const PG_CHECK_VIOLATION = "23514";

/**
 * `fa_transfer` — an asset's location/custodian handover event. BR-FA-02's
 * `fn_check_asset_not_disposed()` trigger (migration `0150`) already blocks
 * inserting a transfer against a disposed/written-off asset — the data is
 * genuinely protected — but its raw SQLSTATE was never translated into a
 * clean client error (confirmed live: a real `500 INTERNAL_ERROR`, same
 * class of gap fixed the same pass in `maintenance.service.ts`), so
 * `create()` now catches it and rethrows as a `ValidationException`.
 */
@Injectable()
export class TransfersService {
  constructor(
    private readonly transferRepository: FaTransferRepository,
    private readonly assetRepository: FaAssetRepository,
  ) {}

  /** Captures `from_location`/`from_custodian_user_id` from the asset's CURRENT values BEFORE updating it, then applies the new location/custodian. */
  async create(em: EntityManager, input: CreateFaTransferInput, actorId: string | null): Promise<FaTransferEntity> {
    const asset = await this.assetRepository.findByIdOrFail(input.assetId, em);

    let transfer: FaTransferEntity;
    try {
      transfer = await this.transferRepository.create(
        {
          assetId: input.assetId,
          fromLocation: asset.location,
          fromCustodianUserId: asset.custodianUserId,
          toLocation: input.toLocation,
          toCustodianUserId: input.toCustodianUserId ?? null,
          ackBy: null,
          at: new Date(),
          createdBy: actorId,
          updatedBy: actorId,
        },
        em,
      );
    } catch (error) {
      if (isCheckViolation(error)) {
        throw new ValidationException(
          `BR-FA-02: asset ${input.assetId} cannot receive further transactions — status=${asset.status} (disposed/written-off assets accept no new transfers)`,
        );
      }
      throw error;
    }

    asset.location = input.toLocation;
    asset.custodianUserId = input.toCustodianUserId ?? null;
    asset.updatedBy = actorId;
    await this.assetRepository.save(asset, em);

    return transfer;
  }

  /** The new custodian/location confirming receipt — a lightweight workflow, no approval chain per the DDL. */
  async acknowledge(em: EntityManager, transferId: string, ackBy: string): Promise<FaTransferEntity> {
    const transfer = await this.transferRepository.findByIdOrFail(transferId, em);
    if (transfer.ackBy) {
      throw new ValidationException(`fa_transfer ${transferId} has already been acknowledged`);
    }
    transfer.ackBy = ackBy;
    transfer.updatedBy = ackBy;
    return this.transferRepository.save(transfer, em);
  }

  async findByIdOrFail(id: string): Promise<FaTransferEntity> {
    return this.transferRepository.findByIdOrFail(id);
  }

  async listByAsset(assetId: string): Promise<FaTransferEntity[]> {
    return this.transferRepository.findByAssetId(assetId);
  }
}

function isCheckViolation(error: unknown): boolean {
  const code =
    (error as { code?: string; driverError?: { code?: string } })?.code ??
    (error as { driverError?: { code?: string } })?.driverError?.code;
  return code === PG_CHECK_VIOLATION;
}
