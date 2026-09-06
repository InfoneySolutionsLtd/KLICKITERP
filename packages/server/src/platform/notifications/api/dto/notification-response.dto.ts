import { ApiProperty } from "@nestjs/swagger";

export class NotificationResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ maxLength: 60 })
  type!: string;

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
