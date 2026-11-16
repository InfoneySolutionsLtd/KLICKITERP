import { Logger } from "@nestjs/common";
import { ReportBrandingService } from "../application/pdf/report-branding.service";

const LOGO = Buffer.from("logo-bytes");
const SIG_A = Buffer.from("sig-a");
const SIG_B = Buffer.from("sig-b");

function makeTheme(overrides: Record<string, unknown> = {}) {
  return {
    themeId: "theme-1",
    name: "Klickit Academy",
    isFallback: false,
    logoFileId: "logo-file",
    documentConfig: {
      headerText: "  KLICKIT ACADEMY — P.O. Box 1  ",
      footerText: "Thank you",
      watermarkText: "CONFIDENTIAL",
      signatureFileIds: ["sig-a", "sig-b"],
    },
    ...overrides,
  };
}

describe("ReportBrandingService", () => {
  let themesService: { getCurrentTheme: jest.Mock };
  let filesService: { read: jest.Mock };
  let service: ReportBrandingService;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    themesService = { getCurrentTheme: jest.fn(async () => makeTheme()) };
    const bytes: Record<string, Buffer> = { "logo-file": LOGO, "sig-a": SIG_A, "sig-b": SIG_B };
    filesService = { read: jest.fn(async (id: string) => ({ buffer: bytes[id], mime: "image/png", originalName: `${id}.png` })) };
    service = new ReportBrandingService(themesService as never, filesService as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it("loads the logo, header / footer / watermark text and signatures the Branding page configures", async () => {
    const branding = await service.load();

    expect(branding.logo?.buffer).toBe(LOGO);
    expect(branding.headerText).toBe("KLICKIT ACADEMY — P.O. Box 1"); // trimmed
    expect(branding.footerText).toBe("Thank you");
    expect(branding.watermarkText).toBe("CONFIDENTIAL");
    expect(branding.signatures.map((s) => s.buffer)).toEqual([SIG_A, SIG_B]);
  });

  it("falls back to the theme name for the watermark when none is set — as the on-screen watermark does", async () => {
    themesService.getCurrentTheme.mockResolvedValue(makeTheme({ documentConfig: { watermarkText: "   " } }));
    expect((await service.load()).watermarkText).toBe("Klickit Academy");
  });

  it("does NOT use the hardcoded pre-seed theme's name as a watermark — that name isn't the school's", async () => {
    themesService.getCurrentTheme.mockResolvedValue(
      makeTheme({ isFallback: true, name: "Infoney Default", logoFileId: null, documentConfig: { headerText: "Infoney Solutions" } }),
    );
    const branding = await service.load();
    expect(branding.watermarkText).toBeNull();
    expect(branding.logo).toBeNull();
    expect(branding.headerText).toBe("Infoney Solutions");
  });

  it("reads no files when no logo or signatures are configured", async () => {
    themesService.getCurrentTheme.mockResolvedValue(makeTheme({ logoFileId: null, documentConfig: {} }));
    const branding = await service.load();
    expect(filesService.read).not.toHaveBeenCalled();
    expect(branding).toMatchObject({ logo: null, signatures: [], headerText: null, footerText: null });
  });

  it("an unreadable logo drops only the logo — the text branding and signatures survive", async () => {
    filesService.read.mockImplementation(async (id: string) => {
      if (id === "logo-file") throw new Error("object not found");
      return { buffer: SIG_A, mime: "image/png", originalName: "s.png" };
    });

    const branding = await service.load();

    expect(branding.logo).toBeNull();
    expect(branding.headerText).toBe("KLICKIT ACADEMY — P.O. Box 1");
    expect(branding.signatures).toHaveLength(2);
  });

  it("an unreadable signature is omitted and the rest kept", async () => {
    filesService.read.mockImplementation(async (id: string) => {
      if (id === "sig-a") throw new Error("too large");
      return { buffer: id === "logo-file" ? LOGO : SIG_B, mime: "image/png", originalName: "x.png" };
    });

    const branding = await service.load();

    expect(branding.logo?.buffer).toBe(LOGO);
    expect(branding.signatures.map((s) => s.buffer)).toEqual([SIG_B]);
  });

  it("never fails the export: if the theme itself can't be loaded the report is simply unbranded", async () => {
    themesService.getCurrentTheme.mockRejectedValue(new Error("db down"));

    await expect(service.load()).resolves.toEqual({ logo: null, headerText: null, footerText: null, watermarkText: null, signatures: [] });
    expect(filesService.read).not.toHaveBeenCalled();
  });
});
