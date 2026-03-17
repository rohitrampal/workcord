/**
 * Task Service Tests
 */

import { Test, TestingModule } from '@nestjs/testing';
import { TaskService } from '@domain/tasks/task.service';
import { PrismaService } from '@infra/database/prisma.service';
import { AuditService } from '@domain/audit/audit.service';
import { TaskStatus, TaskPriority } from '@shared/types';
import { testPrisma, createTestGuild, createTestUser } from '../setup';

describe('TaskService', () => {
  let service: TaskService;
  let guildId: string;
  let userId: string;
  let assigneeId: string;

  const mockAuditService = {
    logAction: jest.fn(),
  };

  beforeAll(async () => {
    // Just set IDs, don't create records yet
    guildId = `test-guild-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    userId = `test-user-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    assigneeId = 'assignee-1';
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
    const existingAssignee = await testPrisma.user.findUnique({
      where: { guildId_id: { guildId, id: assigneeId } },
    });
    if (!existingAssignee) {
      await testPrisma.user.create({
        data: {
          id: assigneeId,
          guildId,
          username: 'assignee',
          discriminator: '0001',
        },
      });
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskService,
        {
          provide: PrismaService,
          useValue: testPrisma,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
      ],
    }).compile();

    service = module.get<TaskService>(TaskService);
    mockAuditService.logAction.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    // Clean up tasks after each test (but keep guild and users)
    await testPrisma.task.deleteMany({ where: { guildId } });
  });

  describe('createTask', () => {
    it('should create task with all fields', async () => {
      const result = await service.createTask(
        guildId,
        userId,
        'Test Task',
        assigneeId,
        'Description',
        '2024-12-31',
        TaskPriority.HIGH,
      );

      expect(result.id).toBeDefined();
      expect(result.title).toBe('Test Task');
      expect(result.status).toBe('Not Started');
    });

    it('should create task without optional fields', async () => {
      // Ensure guild and users exist (they should from beforeEach, but double-check)
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
      const existingAssignee = await testPrisma.user.findUnique({
        where: { guildId_id: { guildId, id: assigneeId } },
      });
      if (!existingAssignee) {
        await testPrisma.user.create({
          data: {
            id: assigneeId,
            guildId,
            username: 'assignee',
            discriminator: '0001',
          },
        });
      }

      const result = await service.createTask(guildId, userId, 'Simple Task', assigneeId);

      expect(result.id).toBeDefined();
      expect(result.title).toBe('Simple Task');
    });
  });

  describe('updateTask', () => {
    it('should update task status', async () => {
      const task = await service.createTask(guildId, userId, 'Update Task', assigneeId);

      const result = await service.updateTask(task.id, TaskStatus.IN_PROGRESS);

      expect(result.status).toBe('In Progress');
    });

    it('should set completedAt when status is Completed', async () => {
      const task = await service.createTask(guildId, userId, 'Complete Task', assigneeId);

      await service.updateTask(task.id, TaskStatus.COMPLETED);

      const updated = await testPrisma.task.findUnique({ where: { id: task.id } });
      expect(updated?.completedAt).toBeDefined();
    });

    it('should update blocker reason', async () => {
      const task = await service.createTask(guildId, userId, 'Blocked Task', assigneeId);

      const result = await service.updateTask(task.id, TaskStatus.BLOCKED, 'Waiting for approval');

      expect(result.status).toBe('Blocked');
    });

    it('should throw error for non-existent task', async () => {
      await expect(service.updateTask('non-existent-id-12345', TaskStatus.IN_PROGRESS)).rejects.toThrow();
    });
  });

  describe('getTasks', () => {
    it('should return all tasks for guild', async () => {
      // Clean up any existing tasks first
      await testPrisma.task.deleteMany({ where: { guildId } });

      await service.createTask(guildId, userId, 'Task 1', assigneeId);
      await service.createTask(guildId, userId, 'Task 2', assigneeId);

      const tasks = await service.getTasks(guildId);

      expect(tasks.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by assignee', async () => {
      const tasks = await service.getTasks(guildId, { assigneeId });

      tasks.forEach((task) => {
        expect(task.assigneeId).toBe(assigneeId);
      });
    });

    it('should filter by status', async () => {
      const task = await service.createTask(guildId, userId, 'In Progress Task', assigneeId);
      await service.updateTask(task.id, TaskStatus.IN_PROGRESS);

      const tasks = await service.getTasks(guildId, { status: TaskStatus.IN_PROGRESS });

      expect(tasks.length).toBeGreaterThan(0);
      tasks.forEach((task) => {
        expect(task.status).toBe('In Progress');
      });
    });

    it('should filter overdue tasks', async () => {
      await service.createTask(guildId, userId, 'Overdue Task', assigneeId, undefined, '2020-01-01');

      const tasks = await service.getTasks(guildId, { overdue: true });

      expect(tasks.length).toBeGreaterThan(0);
      tasks.forEach((task) => {
        expect(task.dueDate).toBeDefined();
        expect(new Date(task.dueDate!).getTime()).toBeLessThan(Date.now());
        expect(task.status).not.toBe('Completed');
      });
    });
  });

  describe('getOverdueTasks', () => {
    it('should return only overdue tasks', async () => {
      // Ensure guild and users exist
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
      const existingAssignee = await testPrisma.user.findUnique({
        where: { guildId_id: { guildId, id: assigneeId } },
      });
      if (!existingAssignee) {
        await testPrisma.user.create({
          data: {
            id: assigneeId,
            guildId,
            username: 'assignee',
            discriminator: '0001',
          },
        });
      }

      await service.createTask(guildId, userId, 'Overdue', assigneeId, undefined, '2020-01-01');
      await service.createTask(guildId, userId, 'Future', assigneeId, undefined, '2099-12-31');

      const overdue = await service.getOverdueTasks(guildId);

      expect(overdue.length).toBeGreaterThan(0);
      overdue.forEach((task) => {
        expect(new Date(task.dueDate!).getTime()).toBeLessThan(Date.now());
      });
    });
  });

  describe('getCompletionRate', () => {
    it('should calculate completion rate', async () => {
      await service.createTask(guildId, userId, 'Task 1', assigneeId);
      await service.createTask(guildId, userId, 'Task 2', assigneeId);

      const task1 = (await service.getTasks(guildId))[0];
      await service.updateTask(task1.id, TaskStatus.COMPLETED);

      const rate = await service.getCompletionRate(guildId);

      expect(rate).toBeGreaterThan(0);
      expect(rate).toBeLessThanOrEqual(100);
    });

    it('should return 0 for no tasks', async () => {
      const rate = await service.getCompletionRate(`empty-guild-${Date.now()}`);

      expect(rate).toBe(0);
    });
  });
});
