import { DomainException } from "../../../../shared/exceptions/domain-exception";

/**
 * A receipt is a proof of payment that must be tied to a school. When the school has set up NEITHER a logo NOR letterhead text
 * (Branding -> Documents), the receipt would carry nothing that says whose it is, so it is not issued until they have. The
 * parent is told, in plain words, that the school has not finished setting up receipts.
 */
export class ReceiptBrandingMissingException extends DomainException {
  readonly code = "RECEIPT_BRANDING_MISSING";
  readonly httpStatus = 409;

  constructor() {
    super("This school has not set up its logo or letterhead for receipts yet (Branding -> Documents), so receipts cannot be issued as PDFs.");
  }
}
