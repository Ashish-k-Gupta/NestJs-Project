import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationModule } from './organization/organization.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbUrl = configService.get<string>('INTERNAL_DATABASE_URL_RENDER');
        return {
          type: 'postgres',
          url: dbUrl,
          // database: configService.get<string>('DB_NAME'),
          // port: configService.get<number>('DB_PORT'),
          // username: configService.get<string>('DB_USERNAME'),
          // password: configService.get('DB_PASSWORD'),
          // host: configService.get<string>('DB_HOST'),
          // entities: [__dirname + '/**/*.entity{.ts,.js}'],
          synchronize: true,
          logging: true,
          autoLoadEntities: true,
          ssl: dbUrl?.includes('render.com')
            ? { rejectUnauthorized: false }
            : false,
        };
      },
    }),
    UserModule,
    AuthModule,
    OrganizationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
