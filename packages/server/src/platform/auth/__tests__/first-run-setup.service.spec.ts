import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { FirstRunSetupService } from "../application/first-run-setup.service";

describe("FirstRunSetupService", () => {
  let dataSource: { query: jest.Mock };
  let usersService: { create: jest.Mock; setInitialPassword: jest.Mock; findByUsername: jest.Mock };
  let rolesService: { list: jest.Mock; assignRoleToUser: jest.Mock };
  let authService: { completeLoginAfter2fa: jest.Mock };
  let service: FirstRunSetupService;

  const input = {
    administratorEmail: "jane.doe@example.com",
    administratorFirstName: "Jane",
    administratorLastName: "Doe",
    password: "a-real-password-123",
  };

  beforeEach(() => {
    dataSource = { query: jest.fn().mockResolvedValue([]) }; // no System Admin yet, by default
    usersService = {
      create: jest.fn(async (createInput: { username: string }) => ({
        user: { id: "user-1", username: createInput.username },
        temporaryPassword: "discarded",
      })),
      setInitialPassword: jest.fn(async () => undefined),
      findByUsername: jest.fn().mockResolvedValue(null),
    };
    rolesService = {
      list: jest.fn().mockResolvedValue([{ id: "role-1", name: "System Admin" }, { id: "role-2", name: "Auditor" }]),
      assignRoleToUser: jest.fn(async () => undefined),
    };
    authService = { completeLoginAfter2fa: jest.fn(async () => ({ stage: "complete" as const, accessToken: "token" })) };
    service = new FirstRunSetupService(dataSource as never, usersService as never, rolesService as never, authService as never);
  });

  describe("getStatus", () => {
    it("reports not complete when no row comes back", async () => {
      dataSource.query.mockResolvedValue([]);
      expect(await service.getStatus()).toEqual({ setupComplete: false });
    });

    it("reports complete when a System Admin role-holder row comes back", async () => {
      dataSource.query.mockResolvedValue([{}]);
      expect(await service.getStatus()).toEqual({ setupComplete: true });
    });
  });

  describe("completeSetup", () => {
    it("creates the user with a username derived from the email, sets the chosen password, assigns System Admin, and mints a session", async () => {
      const result = await service.completeSetup(input, "1.2.3.4", "test-agent");

      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ username: "jane.doe", fullName: "Jane Doe", email: input.administratorEmail, userType: "SYSTEM" }),
        null,
      );
      expect(usersService.setInitialPassword).toHaveBeenCalledWith("user-1", input.password);
      expect(rolesService.assignRoleToUser).toHaveBeenCalledWith("user-1", "role-1");
      expect(authService.completeLoginAfter2fa).toHaveBeenCalledWith("user-1", "1.2.3.4", "test-agent");
      expect(result).toEqual({ stage: "complete", accessToken: "token" });
    });

    it("refuses once a System Admin already exists, and never creates a second one", async () => {
      dataSource.query.mockResolvedValue([{}]);

      await expect(service.completeSetup(input, "1.2.3.4", "test-agent")).rejects.toBeInstanceOf(ConflictException);
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it("suffixes the derived username on a collision", async () => {
      usersService.findByUsername.mockImplementation(async (username: string) => (username === "jane.doe" ? { id: "someone-else" } : null));

      await service.completeSetup(input, "1.2.3.4", "test-agent");

      expect(usersService.create).toHaveBeenCalledWith(expect.objectContaining({ username: "jane.doe1" }), null);
    });

    it("throws a clear error if the System Admin role is missing from the seed", async () => {
      rolesService.list.mockResolvedValue([{ id: "role-2", name: "Auditor" }]);

      await expect(service.completeSetup(input, "1.2.3.4", "test-agent")).rejects.toThrow(/System Admin.*not found/);
      expect(rolesService.assignRoleToUser).not.toHaveBeenCalled();
    });
  });
});
