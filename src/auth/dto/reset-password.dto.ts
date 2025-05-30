import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 character long.' })
  @MaxLength(20, { message: "Password can't be longer than 20 character" })
  newPassword: string;
}
