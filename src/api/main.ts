import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ApiModule } from './api.module';

async function bootstrap() {
  const logger = new Logger('API');
  const port = process.env.PORT || 3000;

  try {
    const app = await NestFactory.create(ApiModule);

    // Global validation pipe
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    // Swagger/OpenAPI Documentation
    const config = new DocumentBuilder()
      .setTitle('PraXio API')
      .setDescription(
        'Enterprise Workforce Management Solution API for Discord. Provides REST endpoints for accessing attendance, leave, task, and user data.',
      )
      .setVersion('1.0.0')
      .addApiKey(
        {
          type: 'apiKey',
          name: 'x-api-key',
          in: 'header',
          description: 'API Key for authentication. Get your API key from the admin panel.',
        },
        'ApiKeyAuth',
      )
      .addTag('attendance', 'Attendance tracking endpoints')
      .addTag('leaves', 'Leave management endpoints')
      .addTag('tasks', 'Task management endpoints')
      .addTag('users', 'User management endpoints')
      .addTag('health', 'Health check endpoint')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    });

    logger.log(`Swagger documentation available at http://localhost:${port}/api/docs`);

    await app.listen(port);
    logger.log(`PraXio API is running on port ${port}`);
  } catch (error) {
    logger.error('Failed to start API', error);
    process.exit(1);
  }
}

bootstrap();
