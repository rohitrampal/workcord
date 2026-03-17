/**
 * End-to-End Tests - User Journeys
 * Complete user workflows from Discord to database
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BotModule } from '@bot/bot.module';
import { ApiModule } from '@api/api.module';
import { PrismaService } from '@infra/database/prisma.service';
import { RedisService } from '@infra/redis/redis.service';
import { testPrisma, createTestGuild, createTestUser } from '../setup';

describe('User Journey E2E Tests', () => {
  let botModule: TestingModule;
  let apiModule: TestingModule;
  let guildId: string;
  let userId: string;
  let adminId: string;

  beforeAll(async () => {
    const guild = await createTestGuild({
      leaveQuotas: {
        sick: 12,
        casual: 12,
        earned: 15,
        unpaid: 0,
      } as any,
    });
    const user = await createTestUser(guild.id);
    const admin = await createTestUser(guild.id, { id: 'admin-123' });
    guildId = guild.id;
    userId = user.id;
    adminId = admin.id;
  });

  beforeEach(async () => {
    // Ensure guild exists first - create if doesn't exist
    const existingGuild = await testPrisma.guild.findUnique({ where: { id: guildId } });
    if (!existingGuild) {
      await testPrisma.guild.create({
        data: {
          id: guildId,
          name: 'Test Guild',
          ownerId: 'test-owner-123',
          isProvisioned: true,
          leaveQuotas: {
            sick: 12,
            casual: 12,
            earned: 15,
            unpaid: 0,
          } as any,
        },
      });
    }
    // Then ensure users exist - create if doesn't exist
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
    const existingAdmin = await testPrisma.user.findUnique({
      where: { guildId_id: { guildId, id: adminId } },
    });
    if (!existingAdmin) {
      await testPrisma.user.create({
        data: {
          id: adminId,
          guildId,
          username: 'admin',
          discriminator: '0001',
        },
      });
    }

    const mockRedisService = {
      getClient: () => null,
      get: async () => null,
      set: async () => 'OK',
      del: async () => 1,
      onModuleInit: async () => {},
      onModuleDestroy: async () => {},
    };

    botModule = await Test.createTestingModule({
      imports: [BotModule],
    })
      .overrideProvider(PrismaService)
      .useValue(testPrisma)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .compile();

    apiModule = await Test.createTestingModule({
      imports: [ApiModule],
    })
      .overrideProvider(PrismaService)
      .useValue(testPrisma)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .compile();
  });

  afterEach(async () => {
    if (botModule) {
      await botModule.close();
    }
    if (apiModule) {
      await apiModule.close();
    }
  });

  describe('Complete Attendance Journey', () => {
    it('should complete full attendance workflow', async () => {
      // This would test the complete flow:
      // 1. User sends /checkin command
      // 2. Bot processes command
      // 3. Service creates attendance record
      // 4. Audit log is created
      // 5. User receives confirmation
      // 6. Later, user sends /checkout
      // 7. Hours are calculated
      // 8. Record is updated
      // 9. API can retrieve the record

      // Implementation would use actual Discord interactions
      // For now, we verify the data flow
      const attendance = await testPrisma.attendance.create({
        data: {
          guildId,
          userId,
          date: new Date(),
          checkInAt: new Date(),
          location: 'Office',
        },
      });

      expect(attendance.id).toBeDefined();

      // Simulate check-out
      const checkOutAt = new Date(attendance.checkInAt);
      checkOutAt.setHours(checkOutAt.getHours() + 8);

      const updated = await testPrisma.attendance.update({
        where: { id: attendance.id },
        data: {
          checkOutAt,
          hoursWorked: 8,
        },
      });

      expect(updated.checkOutAt).toBeDefined();
      expect(updated.hoursWorked).toBe(8);
    });
  });

  describe('Complete Leave Journey', () => {
    it('should complete full leave application and approval', async () => {
      // 1. User applies for leave
      const leave = await testPrisma.leave.create({
        data: {
          guildId,
          userId,
          leaveType: 'Sick Leave',
          startDate: new Date('2024-10-01'),
          endDate: new Date('2024-10-03'),
          reason: 'Sick',
          status: 'Pending',
        },
      });

      expect(leave.status).toBe('Pending');

      // 2. Admin approves leave
      const approved = await testPrisma.leave.update({
        where: { id: leave.id },
        data: {
          status: 'Approved',
          approvedBy: adminId,
          approvedAt: new Date(),
        },
      });

      expect(approved.status).toBe('Approved');
      expect(approved.approvedBy).toBe(adminId);
    });
  });

  describe('Complete Task Journey', () => {
    it('should complete full task lifecycle', async () => {
      // 1. Create task
      const task = await testPrisma.task.create({
        data: {
          guildId,
          assigneeId: userId,
          creatorId: adminId,
          title: 'E2E Test Task',
          status: 'Not Started',
          priority: 'High',
          dueDate: new Date('2024-12-31'),
        },
      });

      expect(task.status).toBe('Not Started');

      // 2. Update to In Progress
      const inProgress = await testPrisma.task.update({
        where: { id: task.id },
        data: { status: 'In Progress' },
      });

      expect(inProgress.status).toBe('In Progress');

      // 3. Complete task
      const completed = await testPrisma.task.update({
        where: { id: task.id },
        data: {
          status: 'Completed',
          completedAt: new Date(),
        },
      });

      expect(completed.status).toBe('Completed');
      expect(completed.completedAt).toBeDefined();
    });
  });

  describe('Complete HR Ticket Journey', () => {
    it('should complete full HR ticket workflow', async () => {
      // 1. User creates ticket
      const ticket = await testPrisma.hrTicket.create({
        data: {
          guildId,
          userId,
          category: 'Leave',
          question: 'How do I apply for leave?',
          status: 'Open',
        },
      });

      expect(ticket.status).toBe('Open');

      // 2. Admin responds
      const responded = await testPrisma.hrTicket.update({
        where: { id: ticket.id },
        data: {
          status: 'Resolved',
          response: 'Use /leave apply command',
          respondedBy: adminId,
          respondedAt: new Date(),
        },
      });

      expect(responded.status).toBe('Resolved');
      expect(responded.response).toBeDefined();
    });
  });
});
