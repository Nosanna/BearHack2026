import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import express from 'express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
    bodyParser: false,
  });

  // helmet defaults block cross-origin resource loads, which would prevent the
  // mobile app (or browser) from rendering images served by /media/local/*.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.enableCors({ origin: true, credentials: true });

  // Path-scoped raw body parser so PUT /media/local-upload/* receives binary
  // bytes (used when S3 is not configured). Registered BEFORE json/urlencoded
  // so it wins for that prefix.
  app.use(
    '/media/local-upload',
    express.raw({ type: '*/*', limit: '20mb' }),
  );

  // Default JSON / form parsers for everything else.
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('Fixit Fred API')
    .setDescription('AI-powered home appliance repair and maintenance assistant.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.API_PORT ?? 4000);
  // Bind to 0.0.0.0 so devices on the same LAN (e.g. an Expo Go phone) can reach the API.
  await app.listen(port, '0.0.0.0');
  Logger.log(`Fixit Fred API listening on http://0.0.0.0:${port}`, 'Bootstrap');
  Logger.log(`Swagger UI on http://localhost:${port}/docs`, 'Bootstrap');
}

bootstrap();
