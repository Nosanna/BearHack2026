import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(20)
  idToken!: string;
}

export class RefreshDto {
  @IsString()
  @MinLength(20)
  refreshToken!: string;
}
