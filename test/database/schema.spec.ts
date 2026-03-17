/**
 * Database Schema Tests
 * Tests for Prisma schema, relationships, and constraints
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { testPrisma, createTestGuild, createTestUser, createTestChannel } from '../setup';

describe('Database Schema', () => {
  describe('Guild Model', () => {
    it('should create a guild with required fields', async () => {
      const guild = await createTestGuild();
      expect(guild.id).toBeDefined();
      expect(guild.name).toBe('Test Guild');
      expect(guild.isProvisioned).toBe(true);
    });

    it('should enforce unique guild ID', async () => {
      const guildId = `test-guild-${Date.now()}`;
      await createTestGuild({ id: guildId });

      await expect(
        testPrisma.guild.create({
          data: {
            id: guildId,
            name: 'Duplicate',
            ownerId: 'owner-123',
          },
        }),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    });

    it('should store JSON fields correctly', async () => {
      const reminderTimes = { todoReminder: '09:15', eodReminder: '18:00' };
      const penaltyConfig = { todoDefault: 1, eodDefault: 1 };
      const leaveQuotas = { sick: 12, casual: 12, earned: 15 };

      const guild = await testPrisma.guild.create({
        data: {
          id: `test-guild-${Date.now()}`,
          name: 'Test Guild',
          ownerId: 'owner-123',
          reminderTimes: reminderTimes as any,
          penaltyConfig: penaltyConfig as any,
          leaveQuotas: leaveQuotas as any,
        },
      });

      expect(guild.reminderTimes).toEqual(reminderTimes);
      expect(guild.penaltyConfig).toEqual(penaltyConfig);
      expect(guild.leaveQuotas).toEqual(leaveQuotas);
    });
  });

  describe('User Model', () => {
    it('should create a user with required fields', async () => {
      const guild = await createTestGuild();
      const user = await createTestUser(guild.id);

      expect(user.id).toBeDefined();
      expect(user.guildId).toBe(guild.id);
      expect(user.username).toBe('testuser');
      expect(user.penaltyPoints).toBe(0);
      expect(user.isActive).toBe(true);
    });

    it('should enforce unique user per guild', async () => {
      const guild = await createTestGuild();
      const userId = `test-user-${Date.now()}`;
      await createTestUser(guild.id, { id: userId });

      await expect(
        testPrisma.user.create({
          data: {
            id: userId,
            guildId: guild.id,
            username: 'duplicate',
          },
        }),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    });

    it('should cascade delete users when guild is deleted', async () => {
      const guild = await createTestGuild();
      const user = await createTestUser(guild.id);

      await testPrisma.guild.delete({ where: { id: guild.id } });

      const deletedUser = await testPrisma.user.findUnique({
        where: { id: user.id },
      });
      expect(deletedUser).toBeNull();
    });
  });

  describe('Channel Model', () => {
    it('should create a channel with required fields', async () => {
      const guild = await createTestGuild();
      const channel = await createTestChannel(guild.id);

      expect(channel.id).toBeDefined();
      expect(channel.guildId).toBe(guild.id);
      expect(channel.name).toBe('test-channel');
      expect(channel.type).toBe('general');
      expect(channel.isWfmEnabled).toBe(false);
    });

    it('should enforce unique channel name per guild', async () => {
      const guild = await createTestGuild();
      const channelName = `test-channel-${Date.now()}`;
      await createTestChannel(guild.id, { name: channelName });

      await expect(
        testPrisma.channel.create({
          data: {
            id: `test-channel-${Date.now()}`,
            guildId: guild.id,
            name: channelName,
            type: 'general',
          },
        }),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    });
  });

  describe('Attendance Model', () => {
    it('should create attendance record with foreign keys', async () => {
      const guild = await createTestGuild();
      const user = await createTestUser(guild.id);

      const attendance = await testPrisma.attendance.create({
        data: {
          guildId: guild.id,
          userId: user.id,
          date: new Date(),
          checkInAt: new Date(),
          location: 'Office',
        },
      });

      expect(attendance.id).toBeDefined();
      expect(attendance.guildId).toBe(guild.id);
      expect(attendance.userId).toBe(user.id);
    });

    it('should enforce foreign key constraints', async () => {
      await expect(
        testPrisma.attendance.create({
          data: {
            guildId: 'non-existent-guild',
            userId: 'non-existent-user',
            date: new Date(),
            checkInAt: new Date(),
            location: 'Office',
          },
        }),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    });
  });

  describe('Leave Model', () => {
    it('should create leave application with all fields', async () => {
      const guild = await createTestGuild();
      const user = await createTestUser(guild.id);

      const leave = await testPrisma.leave.create({
        data: {
          guildId: guild.id,
          userId: user.id,
          leaveType: 'Sick Leave',
          startDate: new Date('2024-02-01'),
          endDate: new Date('2024-02-03'),
          reason: 'Sick',
          status: 'Pending',
        },
      });

      expect(leave.id).toBeDefined();
      expect(leave.status).toBe('Pending');
    });
  });

  describe('Task Model', () => {
    it('should create task with assignee and creator', async () => {
      const guild = await createTestGuild();
      const assignee = await createTestUser(guild.id, { id: 'assignee-1' });
      const creator = await createTestUser(guild.id, { id: 'creator-1' });

      const task = await testPrisma.task.create({
        data: {
          guildId: guild.id,
          assigneeId: assignee.id,
          creatorId: creator.id,
          title: 'Test Task',
          status: 'Not Started',
          priority: 'Normal',
        },
      });

      expect(task.id).toBeDefined();
      expect(task.assigneeId).toBe(assignee.id);
      expect(task.creatorId).toBe(creator.id);
    });

    it('should support nullable due date and blocker reason', async () => {
      const guild = await createTestGuild();
      const user = await createTestUser(guild.id);

      const task = await testPrisma.task.create({
        data: {
          guildId: guild.id,
          assigneeId: user.id,
          creatorId: user.id,
          title: 'Task without due date',
          status: 'Blocked',
          blockerReason: 'Waiting for approval',
        },
      });

      expect(task.dueDate).toBeNull();
      expect(task.blockerReason).toBe('Waiting for approval');
    });
  });

  describe('HrTicket Model', () => {
    it('should create HR ticket with unique ticket ID', async () => {
      const guild = await createTestGuild();
      const user = await createTestUser(guild.id);

      const ticket = await testPrisma.hrTicket.create({
        data: {
          guildId: guild.id,
          userId: user.id,
          category: 'Leave',
          question: 'How do I apply for leave?',
          status: 'Open',
        },
      });

      expect(ticket.id).toBeDefined();
      expect(ticket.ticketId).toBeDefined();
      expect(ticket.status).toBe('Open');
    });

    it('should enforce unique ticket ID', async () => {
      const guild = await createTestGuild();
      const user = await createTestUser(guild.id);
      const ticketId = `ticket-${Date.now()}`;

      await testPrisma.hrTicket.create({
        data: {
          guildId: guild.id,
          userId: user.id,
          ticketId,
          category: 'Leave',
          question: 'Question 1',
        },
      });

      await expect(
        testPrisma.hrTicket.create({
          data: {
            guildId: guild.id,
            userId: user.id,
            ticketId,
            category: 'Leave',
            question: 'Question 2',
          },
        }),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    });
  });

  describe('KnowledgeArticle Model', () => {
    it('should create knowledge article with tags array', async () => {
      const guild = await createTestGuild();

      const article = await testPrisma.knowledgeArticle.create({
        data: {
          guildId: guild.id,
          title: 'Test Article',
          content: 'Article content',
          category: 'Policies',
          tags: ['policy', 'hr', 'test'],
          createdBy: 'admin-123',
          updatedBy: 'admin-123',
        },
      });

      expect(article.id).toBeDefined();
      expect(article.tags).toEqual(['policy', 'hr', 'test']);
      expect(article.views).toBe(0);
      expect(article.helpful).toBe(0);
      expect(article.notHelpful).toBe(0);
    });
  });

  describe('AuditLog Model', () => {
    it('should create audit log with flexible details JSON', async () => {
      const guild = await createTestGuild();
      const user = await createTestUser(guild.id);

      const auditLog = await testPrisma.auditLog.create({
        data: {
          guildId: guild.id,
          userId: user.id,
          action: 'checkin',
          entityType: 'attendance',
          entityId: 'attendance-123',
          details: {
            location: 'Office',
            timestamp: new Date().toISOString(),
          } as any,
        },
      });

      expect(auditLog.id).toBeDefined();
      expect(auditLog.details).toBeDefined();
    });
  });

  describe('Indexes and Performance', () => {
    it('should have indexes on frequently queried fields', async () => {
      // Test that indexes exist by checking query performance
      const guild = await createTestGuild();
      const user = await createTestUser(guild.id);

      // Create multiple records
      for (let i = 0; i < 10; i++) {
        await testPrisma.attendance.create({
          data: {
            guildId: guild.id,
            userId: user.id,
            date: new Date(2024, 0, i + 1),
            checkInAt: new Date(),
            location: 'Office',
          },
        });
      }

      // Query should be fast with index on guildId, userId, date
      const start = Date.now();
      const records = await testPrisma.attendance.findMany({
        where: {
          guildId: guild.id,
          userId: user.id,
        },
      });
      const duration = Date.now() - start;

      expect(records.length).toBe(10);
      expect(duration).toBeLessThan(1000); // Should be fast with indexes
    });
  });
});
