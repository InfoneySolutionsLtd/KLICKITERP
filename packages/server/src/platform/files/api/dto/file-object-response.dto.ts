import { ApiProperty } from "@nestjs/swagger";

/**
 * HTTP response shape for `file_object` — a plain class (not
 * `Omit<FileObjectEntity, "uploadedByUser">`) so the controller's `toView`
 * mapper has a concrete Swagger-documented target and the optional,
 * not-always-loaded `uploadedByUser` relation never leaks into a response.
 */
export class FileObjectResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  bucket!: string;

  @ApiProperty()
  objectKey!: string;

  @ApiProperty()
  originalName!: string;

  @ApiProperty()
  mime!: string;

  @ApiProperty({ description: "bigint, represented as a decimal string" })
  sizeBytes!: string;

  @ApiProperty()
  sha256!: string;

  @ApiProperty({ nullable: true, type: String })
  entityType!: string | null;

  @ApiProperty({ nullable: true, format: "uuid", type: String })
  entityId!: string | null;

  @ApiProperty({ format: "uuid" })
  uploadedBy!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ nullable: true, format: "uuid", type: String })
  createdBy!: string | null;

  @ApiProperty({ nullable: true, format: "uuid", type: String })
  updatedBy!: string | null;
}

/** `GET /files`'s real response envelope — a real `@nestjs/swagger`-decorated class, not a bare interface (an interface here would silently produce zero generated contract types, the same documented pitfall `platform/comms/api/messages.controller.ts`'s own `ListMessagesResponseDto` is the cautionary example of). Mirrors `UserListResponseDto`'s exact shape. */
export class FileListResponseDto {
  @ApiProperty({ type: [FileObjectResponseDto] })
  items!: FileObjectResponseDto[];

  @ApiProperty({ description: "Total row count matching the applied filters, ignoring page/pageSize" })
  total!: number;
}
