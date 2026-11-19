import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { MAX_PAGE_SIZE } from "../application/notify.service";
import { ListNotificationsQueryDto } from "../api/dto/list-notifications-query.dto";
import { UpdateNotificationEventSettingDto } from "../api/dto/notification-settings.dto";

async function check(query: Record<string, unknown>) {
  const dto = plainToInstance(ListNotificationsQueryDto, query);
  return { dto, errors: await validate(dto) };
}

describe("ListNotificationsQueryDto", () => {
  it("accepts the bell's own requests", async () => {
    expect((await check({ page: "1", pageSize: "8" })).errors).toHaveLength(0);
    expect((await check({})).errors).toHaveLength(0);
  });

  it("refuses a page size above the cap (it used to accept 100000 rows)", async () => {
    expect((await check({ pageSize: String(MAX_PAGE_SIZE + 1) })).errors).not.toHaveLength(0);
    expect((await check({ pageSize: String(MAX_PAGE_SIZE) })).errors).toHaveLength(0);
  });

  it("refuses a page or size below 1, and one that is not a number", async () => {
    expect((await check({ page: "0" })).errors).not.toHaveLength(0);
    expect((await check({ pageSize: "0" })).errors).not.toHaveLength(0);
    expect((await check({ page: "abc" })).errors).not.toHaveLength(0);
  });

  it("reads unreadOnly from a query string", async () => {
    expect((await check({ unreadOnly: "true" })).dto.unreadOnly).toBe(true);
    expect((await check({ unreadOnly: "1" })).dto.unreadOnly).toBe(true);
    expect((await check({ unreadOnly: "false" })).dto.unreadOnly).toBe(false);
    expect((await check({ unreadOnly: "nonsense" })).dto.unreadOnly).toBe(false);
  });
});

describe("UpdateNotificationEventSettingDto", () => {
  const run = async (body: Record<string, unknown>) => validate(plainToInstance(UpdateNotificationEventSettingDto, body));

  it("accepts an on/off, a role list, both, or neither", async () => {
    expect(await run({ isEnabled: false })).toHaveLength(0);
    expect(await run({ roleIds: ["0198c8f4-9d2a-7c11-8a55-3f2f1c0b7e11"] })).toHaveLength(0);
    expect(await run({ isEnabled: true, roleIds: [] })).toHaveLength(0);
    expect(await run({})).toHaveLength(0);
  });

  it("refuses a role id that is not an id, or an on/off that is not a boolean", async () => {
    expect(await run({ roleIds: ["not-an-id"] })).not.toHaveLength(0);
    expect(await run({ isEnabled: "yes" })).not.toHaveLength(0);
  });
});
