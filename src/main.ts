import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const configService = app.get(ConfigService);
  const appPort = configService.get<number>('PORT') || 3000;
  await app.listen(appPort);

  const dbHost = configService.get<string>('DB_HOST');
  const dbPort = configService.get<number>('DB_PORT');
  const dbName = configService.get<string>('DB_NAME');

  console.log(`Application is running on: ${await app.getUrl()}`);
  console.log(`Connected to database: ${dbName} on ${dbHost}:${dbPort}`);
  console.log('Database synchronization (if enabled) completed.');
}
bootstrap();
