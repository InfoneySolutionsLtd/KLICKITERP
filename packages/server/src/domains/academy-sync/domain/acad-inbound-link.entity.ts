import { Column, Entity, Index } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";

/**
 * Maps to `acad_inbound_link` — a singleton row: the address this ERP told the Academy to call it on, and the shared
 * secret the Academy signs those calls with (`academy-signature.ts`).
 *
 * The secret is handed to the ERP ONCE, in the answer to `PUT erp/link`, and is stored AES-256-GCM encrypted with the
 * app encryption key (`secret_enc`, same envelope as `license.academy_link.api_key_enc`). It is never returned by the
 * ERP's own API and never logged. Re-registering replaces it (`secretVersion` counts how many times), which is also how
 * it is rotated.
 *
 * `lastVerified*` is the outcome of the admin's "Test connection" (the Academy calls our `ping` and tells us how it
 * went); `lastInboundAt` is the last time a correctly signed call actually arrived.
 */
@Entity("acad_inbound_link")
@Index("uq_acad_inbound_link_singleton", ["singleton"], { unique: true })
export class AcadInboundLinkEntity extends MutableBaseEntity {
  @Column({ type: "boolean", name: "singleton", default: true })
  singleton!: boolean;

  /** The public base the Academy prepends to `/academy/inbound/...`, e.g. `https://erp.school.example/api/v1`. */
  @Column({ type: "varchar", length: 500, name: "registered_base_url" })
  registeredBaseUrl!: string;

  @Column({ type: "bytea", name: "secret_enc" })
  secretEnc!: Buffer;

  @Column({ type: "int", name: "secret_version", default: 1 })
  secretVersion!: number;

  @Column({ type: "timestamptz", name: "registered_at" })
  registeredAt!: Date;

  @Column({ type: "uuid", name: "registered_by", nullable: true })
  registeredBy!: string | null;

  @Column({ type: "timestamptz", name: "last_verified_at", nullable: true })
  lastVerifiedAt!: Date | null;

  @Column({ type: "boolean", name: "last_verify_ok", nullable: true })
  lastVerifyOk!: boolean | null;

  @Column({ type: "varchar", length: 300, name: "last_verify_message", nullable: true })
  lastVerifyMessage!: string | null;

  @Column({ type: "timestamptz", name: "last_inbound_at", nullable: true })
  lastInboundAt!: Date | null;
}
