import { IsString, MaxLength, MinLength } from 'class-validator';

export class StartRepairDto {
  @IsString()
  @MinLength(1)
  applianceId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  symptom!: string;
}

export class RespondDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  answer!: string;
}

export class RepairPhotoDto {
  @IsString()
  imageUrl!: string;
}
