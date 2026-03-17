/**
 * Scheduler Service Tests
 */

import { Test, TestingModule } from '@nestjs/testing';
import { SchedulerService } from '@domain/scheduling/scheduler.service';
import { ReminderService } from '@domain/scheduling/reminder.service';
import { LeaveService } from '@domain/hrms/leave.service';
import { TaskService } from '@domain/tasks/task.service';
import { PrismaService } from '@infra/database/prisma.service';
import { DiscordService } from '@infra/discord/discord.service';
import { testPrisma, createTestGuild, createTestUser } from '../setup';

describe('SchedulerService', () => {
  let service: SchedulerService;
  let guildId: string;
  let userId: string;

  const mockReminderService = {
    sendTodoReminder: jest.fn(),
    sendEodReminder: jest.fn(),
    checkDefaulters: jest.fn(),
  };

  const mockLeaveService = {
    getUpcomingLeaves: jest.fn(),
  };

  const mockTaskService = {
    getOverdueTasks: jest.fn(),
  };

  const mockDiscordService = {
    getTextChannel: jest.fn(),
    getUser: jest.fn(),
  };

  beforeAll(async () => {
    // Just set IDs, don't create records yet
    guildId = `test-guild-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    userId = `test-user-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  });

  beforeEach(async () => {
    // Ensure guild exists first - create if doesn't exist
    let existingGuild = await testPrisma.guild.findUnique({ where: { id: guildId } });
    if (!existingGuild) {
      try {
        await testPrisma.guild.create({
          data: {
            id: guildId,
            name: 'Test Guild',
            ownerId: 'test-owner-123',
            isProvisioned: true,
          },
        });
      } catch (error: any) {
        if (error.code !== 'P2002') {
          existingGuild = await testPrisma.guild.findUnique({ where: { id: guildId } });
          if (!existingGuild) {
            throw error;
          }
        } else {
          existingGuild = await testPrisma.guild.findUnique({ where: { id: guildId } });
          if (!existingGuild) {
            throw error;
          }
        }
      }
    }
    // Then ensure user exists - create if doesn't exist
    const existingUser = await testPrisma.user.findUnique({
      where: { guildId_id: { guildId, id: userId } },
    });
    if (!existingUser) {
      try {
        await testPrisma.user.create({
          data: {
            id: userId,
            guildId,
            username: 'testuser',
            discriminator: '0001',
          },
        });
      } catch (error: any) {
        if (error.code === 'P2003') {
          // FK constraint - ensure guild exists
          const guildCheck = await testPrisma.guild.findUnique({ where: { id: guildId } });
          if (!guildCheck) {
            await testPrisma.guild.create({
              data: {
                id: guildId,
                name: 'Test Guild',
                ownerId: 'test-owner-123',
                isProvisioned: true,
              },
            });
          }
          await testPrisma.user.create({
            data: {
              id: userId,
              guildId,
              username: 'testuser',
              discriminator: '0001',
            },
          });
        } else {
          throw error;
        }
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerService,
        {
          provide: PrismaService,
          useValue: testPrisma,
        },
        {
          provide: ReminderService,
          useValue: mockReminderService,
        },
        {
          provide: LeaveService,
          useValue: mockLeaveService,
        },
        {
          provide: TaskService,
          useValue: mockTaskService,
        },
        {
          provide: DiscordService,
          useValue: mockDiscordService,
        },
      ],
    }).compile();

    service = module.get<SchedulerService>(SchedulerService);
  });

  describe('checkUpcomingLeaves', () => {
    it('should check and notify about upcoming leaves', async () => {
      // Ensure guild is provisioned
      await testPrisma.guild.update({
        where: { id: guildId },
        data: { isProvisioned: true },
      }).catch(() => {
        // Guild might not exist, create it
        return testPrisma.guild.create({
          data: {
            id: guildId,
            name: 'Test Guild',
            ownerId: 'test-owner-123',
            isProvisioned: true,
          },
        });
      });

      // Create an admin channel for the guild
      const existingChannel = await testPrisma.channel.findFirst({
        where: { guildId, type: 'admin' },
      });
      if (!existingChannel) {
        await testPrisma.channel.create({
          data: {
            id: 'admin-channel',
            guildId,
            name: 'admin',
            type: 'admin',
          },
        });
      }

      mockLeaveService.getUpcomingLeaves.mockResolvedValue([
        {
          id: 'leave-1',
          userId,
          leaveType: 'Sick Leave',
          startDate: new Date(),
          endDate: new Date(),
        },
      ]);

      mockDiscordService.getTextChannel.mockResolvedValue({
        send: jest.fn().mockResolvedValue(undefined),
      });

      await service.checkUpcomingLeaves();

      expect(mockLeaveService.getUpcomingLeaves).toHaveBeenCalled();
    });
  });

  describe('checkOverdueTasks', () => {
    it('should check and notify about overdue tasks', async () => {
      mockTaskService.getOverdueTasks.mockResolvedValue([
        {
          id: 'task-1',
          assigneeId: userId,
          title: 'Overdue Task',
          dueDate: new Date('2020-01-01'),
          priority: 'High',
        },
      ]);

      mockDiscordService.getUser.mockResolvedValue({
        send: jest.fn().mockResolvedValue(undefined),
      });

      mockDiscordService.getTextChannel.mockResolvedValue({
        send: jest.fn().mockResolvedValue(undefined),
      });

      await service.checkOverdueTasks();

      expect(mockTaskService.getOverdueTasks).toHaveBeenCalled();
    });
  });
});
