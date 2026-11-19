import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { UsrUserRoleEntity } from "../domain/usr-user-role.entity";

@Injectable()
export class UsrUserRoleRepository {
  constructor(
    @InjectRepository(UsrUserRoleEntity)
    private readonly repo: Repository<UsrUserRoleEntity>,
  ) {}

  async findRolesForUser(userId: string, manager?: EntityManager): Promise<UsrUserRoleEntity[]> {
    return (manager?.getRepository(UsrUserRoleEntity) ?? this.repo).find({
      where: { userId },
      relations: { role: true },
    });
  }

  async exists(userId: string, roleId: string, manager?: EntityManager): Promise<boolean> {
    const count = await (manager?.getRepository(UsrUserRoleEntity) ?? this.repo).count({
      where: { userId, roleId },
    });
    return count > 0;
  }

  /** All user ids currently granted `roleId` — first consumer is `comms` module's `STAFF_ROLE` broadcast audience resolution. */
  async findUserIdsForRole(roleId: string, manager?: EntityManager): Promise<string[]> {
    const rows = await (manager?.getRepository(UsrUserRoleEntity) ?? this.repo).find({ where: { roleId } });
    return rows.map((row) => row.userId);
  }

  /**
   * ACTIVE staff users who hold at least one of `permissionCodes` through any of their roles (de-duplicated). Portal users
   * (`PARENT`) never count: they hold no staff permissions and have no bell. Used to pick who a notification goes to.
   */
  async findActiveUserIdsWithPermissions(permissionCodes: string[], manager?: EntityManager): Promise<string[]> {
    if (permissionCodes.length === 0) return [];
    const rows: Array<{ user_id: string }> = await (manager ?? this.repo.manager).query(
      `
      SELECT DISTINCT ur.user_id
        FROM app.usr_user_role ur
        JOIN app.usr_user u ON u.id = ur.user_id
        JOIN app.usr_role_permission rp ON rp.role_id = ur.role_id
        JOIN app.usr_permission p ON p.id = rp.permission_id
       WHERE p.code = ANY($1::text[]) AND u.status = 'ACTIVE' AND u.user_type <> 'PARENT'
      `,
      [permissionCodes],
    );
    return rows.map((row) => row.user_id);
  }

  /** ACTIVE staff users who hold at least one of `roleIds` (de-duplicated). */
  async findActiveUserIdsInRoles(roleIds: string[], manager?: EntityManager): Promise<string[]> {
    if (roleIds.length === 0) return [];
    const rows: Array<{ user_id: string }> = await (manager ?? this.repo.manager).query(
      `
      SELECT DISTINCT ur.user_id
        FROM app.usr_user_role ur
        JOIN app.usr_user u ON u.id = ur.user_id
       WHERE ur.role_id = ANY($1::uuid[]) AND u.status = 'ACTIVE' AND u.user_type <> 'PARENT'
      `,
      [roleIds],
    );
    return rows.map((row) => row.user_id);
  }

  async assign(userId: string, roleId: string, manager: EntityManager): Promise<UsrUserRoleEntity> {
    const repo = manager.getRepository(UsrUserRoleEntity);
    return repo.save(repo.create({ userId, roleId }));
  }

  async unassign(userId: string, roleId: string, manager: EntityManager): Promise<void> {
    await manager.getRepository(UsrUserRoleEntity).delete({ userId, roleId });
  }
}
