import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";

/** `INAPP` is deliberately excluded — it has no adapter and never will (read entirely from `comm_message` by a future WebSocket consumer), so testing it would always return the same fixed result. */
const TESTABLE_COMM_CHANNELS = ["SMS", "EMAIL", "PUSH", "WHATSAPP"] as const;

export class CommsTestConnectionDto {
  @ApiProperty({ enum: TESTABLE_COMM_CHANNELS })
  @IsIn(TESTABLE_COMM_CHANNELS)
  channel!: (typeof TESTABLE_COMM_CHANNELS)[number];
}

export class CommsTestConnectionResponseDto {
  @ApiProperty()
  ok!: boolean;

  @ApiProperty()
  message!: string;
}
