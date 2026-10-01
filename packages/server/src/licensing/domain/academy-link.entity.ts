import { Column, Entity } from "typeorm";
import { MutableBaseEntity } from "../../shared/database/mutable-base.entity";

/**
 * Maps to `license.academy_link` (migration `0257`). Tracks this
 * instance's connection to the external Academy Gateway — separate from,
 * and feeding into, the pre-existing `license.license` row (see
 * `LicenseEntity`'s own doc comment for that one). One row per instance in
 * practice, same "most recent wins" convention as `LicenseEntity`.
 */
@Entity({ name: "academy_link", schema: "license" })
export class AcademyLinkEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "academy_school_id", nullable: true })
  academySchoolId!: string | null;

  @Column({ type: "varchar", length: 40, name: "academy_school_code", nullable: true })
  academySchoolCode!: string | null;

  /** Set by "start onboarding", cleared by "verify" — never the OTP itself. */
  @Column({ type: "uuid", name: "pending_ref_id", nullable: true })
  pendingRefId!: string | null;

  /** The `<key-id>` segment of `kfe_<key-id>_<secret>` — clear text, display/log-correlation only. */
  @Column({ type: "varchar", length: 60, name: "api_key_id", nullable: true })
  apiKeyId!: string | null;

  /** AES-256-GCM envelope-encrypted full API key (`shared/crypto/aes-gcm.util.ts`). */
  @Column({ type: "bytea", name: "api_key_enc", nullable: true })
  apiKeyEnc!: Buffer | null;

  @Column({ type: "timestamptz", name: "last_entitlement_checked_at", nullable: true })
  lastEntitlementCheckedAt!: Date | null;

  @Column({ type: "timestamptz", name: "last_entitlement_success_at", nullable: true })
  lastEntitlementSuccessAt!: Date | null;

  @Column({ type: "boolean", name: "last_entitlement_allowed", nullable: true })
  lastEntitlementAllowed!: boolean | null;

  @Column({ type: "varchar", length: 20, name: "last_entitlement_status", nullable: true })
  lastEntitlementStatus!: string | null;

  @Column({ type: "timestamptz", name: "last_entitlement_expires_at", nullable: true })
  lastEntitlementExpiresAt!: Date | null;

  @Column({ type: "varchar", length: 500, name: "last_entitlement_error", nullable: true })
  lastEntitlementError!: string | null;
}
