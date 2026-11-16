import { Injectable, Logger } from "@nestjs/common";
import { FilesService } from "../../../../platform/files";
import { ThemesService } from "../../../../platform/branding";
import type { ImageAsset, ReportPdfBranding } from "./report-pdf.renderer";

/** What a school that has configured nothing (or whose branding can't be read) gets: a plain, unbranded report. */
const UNBRANDED: ReportPdfBranding = { logo: null, headerText: null, footerText: null, watermarkText: null, signatures: [] };

function clean(text: string | null | undefined): string | null {
  const trimmed = text?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Loads what the Branding page configures for printed documents (FR-BRND-002.1 "Documents"):
 * the published theme's logo, header / footer / watermark text and signature images.
 *
 * **Never fails an export.** Branding is presentation: a missing file, an unreadable image or a
 * storage hiccup downgrades that one element (e.g. no logo) and is logged, but the report still
 * renders. The watermark falls back to the theme's name when no watermark text is set — the same
 * rule the on-screen `PrintWatermark` applies — except for the hardcoded pre-seed fallback theme,
 * whose name is not the school's.
 */
@Injectable()
export class ReportBrandingService {
  private readonly logger = new Logger(ReportBrandingService.name);

  constructor(
    private readonly themesService: ThemesService,
    private readonly filesService: FilesService,
  ) {}

  async load(): Promise<ReportPdfBranding> {
    let theme;
    try {
      theme = await this.themesService.getCurrentTheme();
    } catch (error) {
      this.logger.warn(`Could not load the branding theme for a report — rendering unbranded: ${(error as Error).message}`);
      return UNBRANDED;
    }

    const documentConfig = theme.documentConfig ?? {};
    const [logo, ...signatures] = await Promise.all([
      theme.logoFileId ? this.readImage(theme.logoFileId, "logo") : Promise.resolve(null),
      ...(documentConfig.signatureFileIds ?? []).map((fileId) => this.readImage(fileId, "signature")),
    ]);

    return {
      logo,
      headerText: clean(documentConfig.headerText),
      footerText: clean(documentConfig.footerText),
      watermarkText: clean(documentConfig.watermarkText) ?? (theme.isFallback ? null : clean(theme.name)),
      signatures: signatures.filter((image): image is ImageAsset => image !== null),
    };
  }

  private async readImage(fileId: string, what: string): Promise<ImageAsset | null> {
    try {
      const { buffer } = await this.filesService.read(fileId);
      return { buffer };
    } catch (error) {
      this.logger.warn(`Could not read the branding ${what} image (${fileId}) for a report — omitting it: ${(error as Error).message}`);
      return null;
    }
  }
}
