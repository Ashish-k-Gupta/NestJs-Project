import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { User } from 'src/user/entity/user.entity';
import { Repository } from 'typeorm';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private configService: ConfigService,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new NotFoundException('JWT_SECRET not found in environment file');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }
  async validate(payload: any) {
    this.logger.debug(`Validate JWT payload ${JSON.stringify(payload)}`);

    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });
    if (!user) {
      this.logger.warn(
        `User with ID ${payload.sub} not found or Invalid token`,
      );
      throw new NotFoundException('Invalid ID or token');
    }
    if (!user.isActive) {
      this.logger.warn(
        `Deactivate user with email ${user.email} is trying to login`,
      );
      throw new UnauthorizedException('User account is deactivated');
    }
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    };
  }
}
