import { IsIn, IsString, Matches } from 'class-validator';

export class SignedUploadDto {
  @IsString()
  @Matches(/^image\/(jpeg|jpg|png|webp|heic)$/i, {
    message: 'contentType must be an image MIME (jpeg/png/webp/heic).',
  })
  contentType!: string;

  @IsIn(['appliance', 'repair-step'])
  kind!: 'appliance' | 'repair-step';
}
