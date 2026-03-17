/**
 * API Endpoint Tests - Users Controller
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ApiModule } from '@api/api.module';
import { PrismaService } from '@infra/database/prisma.service';
import { RedisService } from '@infra/redis/redis.service';
import { testPrisma, createTestGuild, createTestUser, cleanupTestData } from '../setup';

describe('Users API (e2e)', () => {
  let app: INestApplication;
  let apiKey: string;
  let guildId: string;
  let userId: string;

  beforeAll(async () => {
    apiKey = process.env.API_KEY || 'test-api-key';
    process.env.API_KEY = apiKey;

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

    const guild = await createTestGuild();
    const user = await createTestUser(guild.id);
    guildId = guild.id;
    userId = user.id;
  }, 30000); // Increase timeout to 30 seconds

  beforeEach(async () => {
    // Ensure guild and user exist - create if doesn't exist
    const existingGuild = await testPrisma.guild.findUnique({ where: { id: guildId } });
    if (!existingGuild) {
      await testPrisma.guild.create({
        data: {
          id: guildId,
          name: 'Test Guild',
          ownerId: 'test-owner-123',
          isProvisioned: true,
        },
      });
    }
    const existingUser = await testPrisma.user.findUnique({
      where: { guildId_id: { guildId, id: userId } },
    });
    if (!existingUser) {
      await testPrisma.user.create({
        data: {
          id: userId,
          guildId,
          username: 'testuser',
          discriminator: '0001',
        },
      });
    }
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  describe('GET /api/users', () => {
    it('should return 401 without API key', () => {
      return request(app.getHttpServer()).get('/api/users').expect(401);
    });

    it('should return users with valid API key', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/users?guildId=${guildId}`)
        .set('x-api-key', apiKey)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should filter by isActive', async () => {
      await createTestUser(guildId, { id: 'inactive-user', isActive: false });

      const response = await request(app.getHttpServer())
        .get(`/api/users?guildId=${guildId}&isActive=true`)
        .set('x-api-key', apiKey)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      response.body.data.forEach((user: any) => {
        expect(user.isActive).toBe(true);
      });
    });
  });

  describe('GET /api/users/:guildId/:id', () => {
    it('should return 404 for non-existent user', async () => {
      return request(app.getHttpServer())
        .get(`/api/users/${guildId}/non-existent-id`)
        .set('x-api-key', apiKey)
        .expect(404);
    });

    it('should return user by ID', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/users/${guildId}/${userId}`)
        .set('x-api-key', apiKey)
        .expect(200);

      expect(response.body.data.id).toBe(userId);
      expect(response.body.data.guildId).toBe(guildId);
    });
  });
});
