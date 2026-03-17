/**
 * API Endpoint Tests - Leaves Controller
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ApiModule } from '@api/api.module';
import { PrismaService } from '@infra/database/prisma.service';
import { RedisService } from '@infra/redis/redis.service';
import { testPrisma, createTestGuild, createTestUser, cleanupTestData } from '../setup';

describe('Leaves API (e2e)', () => {
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
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  describe('GET /api/leaves', () => {
    it('should return 401 without API key', () => {
      return request(app.getHttpServer()).get('/api/leaves').expect(401);
    });

    it('should return leaves with valid API key', async () => {
      await testPrisma.leave.create({
        data: {
          guildId,
          userId,
          leaveType: 'Sick Leave',
          startDate: new Date('2024-02-01'),
          endDate: new Date('2024-02-03'),
          reason: 'Sick',
          status: 'Pending',
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/api/leaves?guildId=${guildId}`)
        .set('x-api-key', apiKey)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter by status', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/leaves?guildId=${guildId}&status=Pending`)
        .set('x-api-key', apiKey)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      response.body.data.forEach((leave: any) => {
        expect(leave.status).toBe('Pending');
      });
    });

    it('should filter by userId', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/leaves?guildId=${guildId}&userId=${userId}`)
        .set('x-api-key', apiKey)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      response.body.data.forEach((leave: any) => {
        expect(leave.userId).toBe(userId);
      });
    });
  });

  describe('GET /api/leaves/:id', () => {
    it('should return 404 for non-existent leave', async () => {
      return request(app.getHttpServer())
        .get('/api/leaves/non-existent-id')
        .set('x-api-key', apiKey)
        .expect(404);
    });

    it('should return leave by ID', async () => {
      // Ensure guild exists first
      let guild = await testPrisma.guild.findUnique({ where: { id: guildId } });
      if (!guild) {
        try {
          guild = await createTestGuild({ id: guildId, name: 'Test Guild', ownerId: 'test-owner', isProvisioned: true });
        } catch (error: any) {
          // If creation fails, check again
          if (error.code !== 'P2002') {
            guild = await testPrisma.guild.findUnique({ where: { id: guildId } });
            if (!guild) {
              throw error;
            }
          } else {
            guild = await testPrisma.guild.findUnique({ where: { id: guildId } });
            if (!guild) {
              throw error;
            }
          }
        }
      }
      // Then ensure user exists
      let user = await testPrisma.user.findUnique({ 
        where: { guildId_id: { guildId, id: userId } } 
      });
      if (!user) {
        user = await createTestUser(guildId, { id: userId, username: 'testuser', discriminator: '0001' });
      }
      
      const leave = await testPrisma.leave.create({
        data: {
          guildId,
          userId,
          leaveType: 'Casual Leave',
          startDate: new Date('2024-03-01'),
          endDate: new Date('2024-03-02'),
          reason: 'Personal',
          status: 'Approved',
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/api/leaves/${leave.id}`)
        .set('x-api-key', apiKey)
        .expect(200);

      expect(response.body.data.id).toBe(leave.id);
      expect(response.body.data.status).toBe('Approved');
    });
  });
});
