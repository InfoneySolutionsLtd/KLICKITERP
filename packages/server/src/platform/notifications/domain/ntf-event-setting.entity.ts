import { Column, Entity, Index } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";

/**
 * Maps to `ntf_event_setting` (migration `0271`): the school's own choice for one catalogue event, shown on the
 * Communications -> In-app notifications screen. A missing row means the defaults: ON, and the people who hold the
 * event's default permissions. `role_ids` (when not empty) REPLACES those default recipients with the holders of the
 * chosen roles; it is ignored for events whose audience is explicit or managed elsewhere.
 */
@Entity("ntf_event_setting")
@Index("uq_ntf_event_setting_event_code", ["eventCode"], { unique: true })
export class NtfEventSettingEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 60, name: "event_code" })
  eventCode!: string;

  @Column({ type: "boolean", name: "is_enabled", default: true })
  isEnabled!: boolean;

  @Column({ type: "uuid", array: true, name: "role_ids", default: () => "'{}'" })
  roleIds!: string[];
}
