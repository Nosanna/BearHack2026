import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class RegisterFromImageDto {
  @IsString()
  @MinLength(1)
  roomId!: string;

  @IsString()
  @IsUrl({ require_tld: false }) // Vultr Object Storage may use private endpoints
  imageUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  nickname?: string;
}
