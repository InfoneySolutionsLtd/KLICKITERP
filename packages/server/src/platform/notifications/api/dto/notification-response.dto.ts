import { ApiProperty } from "@nestjs/swagger";

export class NotificationResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ maxLength: 60 })
  type!: string;

  @ApiProperty({ nullable: true, type: String, maxLength: 30, description: "The catalogue category of the type; null for a type outside the catalogue" })
  category!: string | null;

  @ApiProperty({
    nullable: true,
    type: "object",
    additionalProperties: true,
    description: "The values the text is built from (names, amounts, numbers), so it can be shown in the reader's language",
  })
  params!: Record<string, string | number | boolean | null> | null;

  @ApiProperty({ maxLength: 200 })
  title!: string;

  @ApiProperty({ nullable: true, type: String })
  body!: string | null;

  @ApiProperty({ nullable: true, type: String })
  link!: string | null;

  @ApiProperty({ nullable: true, type: String })
  entityType!: string | null;

  @ApiProperty({ nullable: true, format: "uuid", type: String })
  entityId!: string | null;

  @ApiProperty({ nullable: true, type: Date })
  readAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;
}

export class ListNotificationsResponseDto {
  @ApiProperty({ type: [NotificationResponseDto] })
  items!: NotificationResponseDto[];

  @ApiProperty()
  meta!: { total: number; page: number; pageSize: number; pageCount: number };
}

export class UnreadCountResponseDto {
  @ApiProperty()
  count!: number;
}
