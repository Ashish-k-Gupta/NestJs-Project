/* eslint-disable @typescript-eslint/no-unsafe-member-access */
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

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,

    @InjectRepository(Organization)
    private organizationRepository: Repository<Organization>,

    private jwtService: JwtService,
    private dataSource: DataSource,
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
        where: { email: dto.adminEmail },
      });
      if (existingUser) {
        throw new ConflictException(
          `User with emailj "${dto.adminEmail}" already exists`,
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
      await queryRunner.manager.save(newAdminUser);
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
        throw new UnauthorizedException(' User account is deactiveated');
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
        throw new NotFoundException(`User with ${userId} do not exists`);
      }
      const isPasswordValid =
        await existingUser.comparePassword(currentPassword);
      if (!isPasswordValid) {
        throw new UnauthorizedException('Current Password is incorrect');
      }
      existingUser.setPassword(newPassword);
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
}
