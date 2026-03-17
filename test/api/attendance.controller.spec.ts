/**
 * API Endpoint Tests - Attendance Controller
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ApiModule } from '@api/api.module';
import { PrismaService } from '@infra/database/prisma.service';
import { RedisService } from '@infra/redis/redis.service';
import { testPrisma, createTestGuild, createTestUser, cleanupTestData } from '../setup';

describe('Attendance API (e2e)', () => {
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

    // Create test data
    const guild = await createTestGuild();
    const user = await createTestUser(guild.id);
    guildId = guild.id;
    userId = user.id;
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  describe('GET /api/attendance', () => {
    it('should return 401 without API key', () => {
      return request(app.getHttpServer()).get('/api/attendance').expect(401);
    });

    it('should return 401 with invalid API key', () => {
      return request(app.getHttpServer())
        .get('/api/attendance')
        .set('x-api-key', 'invalid-key')
        .expect(401);
    });

    it('should return attendance records with valid API key', async () => {
      // Create test attendance
      await testPrisma.attendance.create({
        data: {
          guildId,
          userId,
          date: new Date(`2024-01-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}T${String(Math.floor(Math.random() * 24)).padStart(2, '0')}:00:00Z`),
          checkInAt: new Date(),
          location: 'Office',
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/api/attendance?guildId=${guildId}`)
        .set('x-api-key', apiKey)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should filter by userId', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/attendance?guildId=${guildId}&userId=${userId}`)
        .set('x-api-key', apiKey)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      response.body.data.forEach((record: any) => {
        expect(record.userId).toBe(userId);
      });
    });

    it('should filter by date range', async () => {
      const startDate = '2024-01-01';
      const endDate = '2024-12-31';

      const response = await request(app.getHttpServer())
        .get(`/api/attendance?guildId=${guildId}&startDate=${startDate}&endDate=${endDate}`)
        .set('x-api-key', apiKey)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('GET /api/attendance/:id', () => {
    it('should return 401 without API key', () => {
      return request(app.getHttpServer()).get('/api/attendance/test-id').expect(401);
    });

    it('should return 404 for non-existent attendance', async () => {
      return request(app.getHttpServer())
        .get('/api/attendance/non-existent-id')
        .set('x-api-key', apiKey)
        .expect(404);
    });

    it('should return attendance record by ID', async () => {
      // Ensure user exists (might have been cleaned up by parallel tests)
      let user = await testPrisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        let guild = await testPrisma.guild.findUnique({ where: { id: guildId } });
        if (!guild) {
          try {
            guild = await createTestGuild({ id: guildId, name: 'Test Guild', ownerId: 'test-owner', isProvisioned: true });
          } catch (e) {
            // Guild might already exist, try to fetch it
            guild = await testPrisma.guild.findUnique({ where: { id: guildId } });
            if (!guild) throw e;
          }
        }
        try {
          user = await createTestUser(guildId, { id: userId, username: 'testuser', discriminator: '0001' });
        } catch (e) {
          // User might already exist, try to fetch it
          user = await testPrisma.user.findUnique({ where: { id: userId } });
          if (!user) throw e;
        }
      }
      
      // Use a unique date to avoid constraint violations
      const uniqueDay = Math.floor(Math.random() * 28) + 1;
      const uniqueHour = Math.floor(Math.random() * 24);
      const uniqueDate = new Date(`2024-02-${String(uniqueDay).padStart(2, '0')}T${String(uniqueHour).padStart(2, '0')}:00:00Z`);
      const attendance = await testPrisma.attendance.create({
        data: {
          guildId,
          userId,
          date: uniqueDate,
          checkInAt: new Date(),
          location: 'Office',
        },
      });

      // Verify the record was created
      const createdRecord = await testPrisma.attendance.findUnique({
        where: { id: attendance.id },
      });
      expect(createdRecord).not.toBeNull();

      const response = await request(app.getHttpServer())
        .get(`/api/attendance/${attendance.id}`)
        .set('x-api-key', apiKey)
        .expect(200);

      expect(response.body.data.id).toBe(attendance.id);
      expect(response.body.data.guildId).toBe(guildId);
      expect(response.body.data.userId).toBe(userId);
    });
  });
});
