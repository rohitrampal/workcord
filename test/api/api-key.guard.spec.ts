/**
 * API Key Guard Tests
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ApiModule } from '@api/api.module';
import { PrismaService } from '@infra/database/prisma.service';
import { RedisService } from '@infra/redis/redis.service';
import { testPrisma } from '../setup';

describe('API Key Guard', () => {
  let app: INestApplication;
  let validApiKey: string;

  beforeAll(async () => {
    validApiKey = process.env.API_KEY || 'test-api-key';
    process.env.API_KEY = validApiKey;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApiModule],
    })
      .overrideProvider(PrismaService)
      .useValue(testPrisma)
      .overrideProvider(RedisService)
      .useValue({
        getClient: () => null,
        get: async () => null,
        set: async () => 'OK',
        del: async () => 1,
        onModuleInit: async () => {},
        onModuleDestroy: async () => {},
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Authentication', () => {
    it('should allow access to health check without API key', async () => {
      return request(app.getHttpServer()).get('/health').expect(200);
    });

    it('should reject requests without API key header', async () => {
      return request(app.getHttpServer()).get('/api/attendance').expect(401);
    });

    it('should reject requests with invalid API key', async () => {
      return request(app.getHttpServer())
        .get('/api/attendance')
        .set('x-api-key', 'invalid-key')
        .expect(401);
    });

    it('should accept requests with valid API key', async () => {
      return request(app.getHttpServer())
        .get('/api/attendance?guildId=test')
        .set('x-api-key', validApiKey)
        .expect((res: any) => {
          // Should not be 401, might be 200 or 400 depending on data
          expect([200, 400]).toContain(res.status);
        });
    });

    it('should be case-sensitive for API key', async () => {
      return request(app.getHttpServer())
        .get('/api/attendance')
        .set('x-api-key', validApiKey.toUpperCase())
        .expect(401);
    });
  });
});
