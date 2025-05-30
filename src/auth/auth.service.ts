/* eslint-disable @typescript-eslint/await-thenable */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */ // Keep this if you have other unsafe member accesses
// Remove @typescript-eslint/await-thenable as you'll await all promises correctly
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { UserRole } from 'src/common/enums/user-role.enum';
import { RegisterOrganizationDto } from 'src/organization/dto/register-organization.dto';
import { Organization } from 'src/organization/entity/organization.entity';
import { User } from 'src/user/entity/user.entity';
import { DataSource, Repository } from 'typeorm';
import { LoginDto } from './dto/login.dto';
import { ForgetPasswordDto } from './dto/forget-password.dto';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { EmailService } from 'src/common/service/email.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private userRepository: Repository<User>,
    @InjectRepository(Organization)
    private organizationRepository: Repository<Organization>,
    private jwtService: JwtService,
    private dataSource: DataSource,
    private configService: ConfigService,
    private emailService: EmailService,
  ) {}

  async registerNewOrganization(
    dto: RegisterOrganizationDto,
  ): Promise<{ user: User; organization: Organization; token: string }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const existingOrg = await queryRunner.manager.findOne(Organization, {
        where: { name: dto.organizationName.toLowerCase() },
        relations: ['users'],
      });
      if (existingOrg) {
        throw new ConflictException(
          `Organization with name "${dto.organizationName}" already exists`,
        );
      }
      const existingUser = await queryRunner.manager.findOne(User, {
        where: { email: dto.adminEmail.toLowerCase() },
      });
      if (existingUser) {
        throw new ConflictException(
          `User with email "${dto.adminEmail}" already exists`,
        );
      }

      const newOrganization = queryRunner.manager.create(Organization, {
        name: dto.organizationName,
        subscriptionPlan: dto.subscriptionPlan,
        isActive: true,
      });
      await queryRunner.manager.save(newOrganization);

      const newAdminUser = queryRunner.manager.create(User, {
        email: dto.adminEmail.toLowerCase(),
        password: dto.password,
        firstName: dto.adminFirstName,
        lastName: dto.adminLastName,
        role: UserRole.ADMIN,
        organizationId: newOrganization.id,
        isActive: true,
      });
      newAdminUser.verificationToken = crypto.randomBytes(32).toString('hex');
      newAdminUser.verificationTokenExpires = new Date(
        Date.now() + 15 * 60 * 60 * 1000,
      );
      await queryRunner.manager.save(newAdminUser);

      const appBaseUrl = this.configService.get<string>('APP_BASE_URL');
      const verificationLink = `${appBaseUrl}/auth/verify-email?token=${newAdminUser.verificationToken}`;

      // --- CHANGE START (Line 89 context) ---
      await this.emailService.sendMail({
        to: newAdminUser.email,
        subject: 'Verify Your Email Address for Your New Organization',
        html: `
          <p>Hello ${newAdminUser.firstName},</p>
          <p>Thank you for registering your organization! Please verify your email address to activate your account by clicking on the link below:</p>
          <p><a href="${verificationLink}">Verify My Email Address</a></p>
          <p>This verification link will expire in 15 minutes.</p>
          <p>If you did not create an account, please ignore this email.</p>
          <p>Thanks,</p>
          <p>Your Application Team</p>
        `,
      });
      // --- CHANGE END ---

      this.logger.log(`Verification email sent to ${newAdminUser.email}`);

      this.logger.log('User Created Successfully');
      await queryRunner.commitTransaction();

      const fetchedOrganization = await this.organizationRepository.findOne({
        where: { id: newOrganization.id },
        relations: ['users'],
      });

      if (!fetchedOrganization) {
        throw new InternalServerErrorException(
          'Failed to retrieve organization after creation',
        );
      }

      const payload = {
        sub: newAdminUser.id,
        email: newAdminUser.email,
        organizationId: newAdminUser.organizationId,
        role: newAdminUser.role,
      };
      const token = this.jwtService.sign(payload);
      const userResponse = {
        id: newAdminUser.id,
        email: newAdminUser.email,
        firstName: newAdminUser.firstName,
        lastName: newAdminUser.lastName,
        role: newAdminUser.role,
        organizationId: newAdminUser.organizationId,
      };

      return {
        user: userResponse as User,
        organization: newOrganization,
        token,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Error during organization registration: ${error.message}`,
        error.stack,
      );
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to register organization due to an unexpected error.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async login(
    dto: LoginDto,
  ): Promise<{ message: string; role: UserRole[]; token: string }> {
    try {
      const existingUser = await this.userRepository.findOne({
        where: { email: dto.email.toLowerCase() },
        relations: ['organization'],
      });
      if (!existingUser) {
        throw new UnauthorizedException('Invalid Credentials');
      }
      if (!existingUser.isActive) {
        throw new UnauthorizedException(' User account is deactivated');
      }

      const isPasswordValid = await existingUser.comparePassword(dto.password);
      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid Credentials');
      }
      const payload = {
        sub: existingUser.id,
        email: existingUser.email,
        organizationId: existingUser.organizationId,
        role: existingUser.role,
      };

      const accessToken = this.jwtService.sign(payload);
      return {
        message: 'Logged In Successfully',
        role: [payload.role],
        token: accessToken,
      };
    } catch (error) {
      this.logger.error(`Login error ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw error;
    }
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const existingUser = await queryRunner.manager.findOne(User, {
        where: { id: userId },
      });

      if (!existingUser) {
        throw new NotFoundException(`User with ID ${userId} does not exist`);
      }
      const isPasswordValid =
        await existingUser.comparePassword(currentPassword);
      if (!isPasswordValid) {
        throw new UnauthorizedException('Current Password is incorrect');
      }
      await existingUser.setPassword(newPassword);
      await queryRunner.manager.save(existingUser);
      await queryRunner.commitTransaction();
      return { message: 'Password updated successfully' };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Error changing password for user ID ${userId}: ${error.message}`,
        error.stack,
      );
      if (
        error instanceof NotFoundException ||
        error instanceof UnauthorizedException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to change password due to an unexpected error.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async forgotPassword(dto: ForgetPasswordDto): Promise<{ message: string }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const user = await queryRunner.manager.findOne(User, {
        where: { email: dto.email.toLowerCase() },
      });
      if (!user || !user.isActive || !user.isVerified) {
        this.logger.warn(
          `Password reset requested for non-existent, inactive, or unverified user: ${dto.email}`,
        );
        await queryRunner.rollbackTransaction();
        return {
          message:
            'If an account with that email exists, a password reset link has been sent.',
        };
      }
      const resetToken = crypto.randomBytes(32).toString('hex');
      user.resetPasswordToken = resetToken;
      user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);

      await queryRunner.manager.save(user);

      const appBaseUrl = this.configService.get<string>('APP_BASE_URL');
      const resetLink = `${appBaseUrl}/reset-password?token=${resetToken}`;

      // --- CHANGE START (Line 273 context) ---
      await this.emailService.sendMail({
        to: user.email,
        subject: 'Password Reset Request',
        html: `
          <p>Hello ${user.firstName || user.email},</p>
          <p>You are receiving this because you (or someone else) have requested the reset of the password for your account.</p>
          <p>Please click on the following link, or paste this into your browser to complete the process:</p>
          <p><a href="${resetLink}">Reset My Password</a></p>
          <p>This link will expire in 15 minutes.</p>
          <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
          <p>Thanks,</p>
          <p>Your Application Team</p>
        `,
      });
      // --- CHANGE END ---

      this.logger.log(`Password reset email sent to ${user.email}`);
      await queryRunner.commitTransaction();
      return {
        message:
          'If an account with that email exists, a password reset link has been sent.',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Error during forgot password process for ${dto.email}: ${error.message}`,
        error.stack,
      );
      if (
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to process password reset request due to an unexpected error.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async resetPassword(
    token: string,
    newPasswordPlain: string,
  ): Promise<{ message: string }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const user = await queryRunner.manager.findOne(User, {
        where: { resetPasswordToken: token },
      });

      if (!user) {
        throw new BadRequestException(
          'Invalid or expired password reset token.',
        );
      }
      if (
        !user.resetPasswordExpires ||
        user.resetPasswordExpires < new Date()
      ) {
        throw new BadRequestException(
          'Password reset token has expired. Please request a new one.',
        );
      }

      await user.setPassword(newPasswordPlain);

      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;

      await queryRunner.manager.save(user);
      await queryRunner.commitTransaction();

      // --- CHANGE START (Line 350 context) ---
      await this.emailService.sendMail({
        to: user.email,
        subject: 'Your Password Has Been Changed',
        html: `
          <p>Hello ${user.firstName || user.email},</p>
          <p>This is a confirmation that the password for your account has just been changed.</p>
          <p>If you did not make this change, please contact support immediately.</p>
          <p>Thanks,</p>
          <p>Your Application Team</p>
        `,
      });
      // --- CHANGE END ---

      this.logger.log(`Password successfully reset for user: ${user.email}`);

      return { message: 'Password has been reset successfully.' };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Error during password reset: ${error.message}`,
        error.stack,
      );
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to reset password due to an unexpected error.',
      );
    } finally {
      await queryRunner.release();
    }
  }
}
