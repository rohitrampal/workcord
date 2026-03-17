/**
 * API Endpoint Tests - Tasks Controller
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ApiModule } from '@api/api.module';
import { PrismaService } from '@infra/database/prisma.service';
import { RedisService } from '@infra/redis/redis.service';
import { testPrisma, createTestGuild, createTestUser, cleanupTestData } from '../setup';

describe('Tasks API (e2e)', () => {
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

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  describe('GET /api/tasks', () => {
    it('should return 401 without API key', () => {
      return request(app.getHttpServer()).get('/api/tasks').expect(401);
    });

    it('should return tasks with valid API key', async () => {
      await testPrisma.task.create({
        data: {
          guildId,
          assigneeId: userId,
          creatorId: userId,
          title: 'Test Task',
          status: 'In Progress',
          priority: 'High',
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/api/tasks?guildId=${guildId}`)
        .set('x-api-key', apiKey)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter by status', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/tasks?guildId=${guildId}&status=In Progress`)
        .set('x-api-key', apiKey)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      response.body.data.forEach((task: any) => {
        expect(task.status).toBe('In Progress');
      });
    });

    it('should filter by assigneeId', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/tasks?guildId=${guildId}&assigneeId=${userId}`)
        .set('x-api-key', apiKey)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      response.body.data.forEach((task: any) => {
        expect(task.assigneeId).toBe(userId);
      });
    });

    it('should filter overdue tasks', async () => {
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
      
      await testPrisma.task.create({
        data: {
          guildId,
          assigneeId: userId,
          creatorId: userId,
          title: 'Overdue Task',
          status: 'Not Started',
          dueDate: new Date('2020-01-01'), // Past date
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/api/tasks?guildId=${guildId}&overdue=true`)
        .set('x-api-key', apiKey)
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/tasks/:id', () => {
    it('should return 404 for non-existent task', async () => {
      return request(app.getHttpServer())
        .get('/api/tasks/non-existent-id')
        .set('x-api-key', apiKey)
        .expect(404);
    });

    it('should return task by ID', async () => {
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
      
      const task = await testPrisma.task.create({
        data: {
          guildId,
          assigneeId: userId,
          creatorId: userId,
          title: 'Specific Task',
          status: 'Completed',
          priority: 'Critical',
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/api/tasks/${task.id}`)
        .set('x-api-key', apiKey)
        .expect(200);

      expect(response.body.data.id).toBe(task.id);
      expect(response.body.data.title).toBe('Specific Task');
      expect(response.body.data.status).toBe('Completed');
    });
  });
});
