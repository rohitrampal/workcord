import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
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

    // Health check endpoint
    app.getHttpAdapter().get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    await app.listen(port);
    logger.log(`PraXio API is running on port ${port}`);
  } catch (error) {
    logger.error('Failed to start API', error);
    process.exit(1);
  }
}

bootstrap();
