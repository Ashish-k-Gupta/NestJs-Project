import { Exclude } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SubscriptionPlan } from 'src/common/enums/subscription-plan.enum';

export class RegisterOrganizationDto {
  @IsNotEmpty()
  @IsString()
  organizationName: string;

  @IsNotEmpty()
  @IsEmail()
  @IsString()
  adminEmail: string;

  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(20)
  password: string;

  @IsOptional()
  @IsNotEmpty()
  @IsEnum(SubscriptionPlan)
  subscriptionPlan: SubscriptionPlan;

  @IsOptional()
  @IsString()
  adminFirstName?: string;

  @IsOptional()
  @IsString()
  adminLastName?: string;
}
