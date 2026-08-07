import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import multipart from '@fastify/multipart';

import { AppModule } from './app.module';
import type { ApplicationConfiguration } from './config/configuration';
import type { Environment } from './config/env.schema';

export async function createApplication(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

  await app.register(multipart, { limits: { files: 1, fileSize: 10 * 1024 * 1024 } });

  configureApplication(app);
  return app;
}

export function configureApplication(app: NestFastifyApplication): void {
  const config = app.get<ConfigService<ApplicationConfiguration, true>>(ConfigService);
  const apiConfig = config.getOrThrow<Environment>('api');

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    credentials: true,
    origin: apiConfig.corsOrigins,
  });
  app.enableShutdownHooks();

  if (apiConfig.swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('CV Builder API')
      .setDescription('CV Builder backend API')
      .setVersion('0.0.0')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }
}
