/**
 * Integration Tests - Task Lifecycle
 */

import { Test, TestingModule } from '@nestjs/testing';
import { TaskService } from '@domain/tasks/task.service';
import { PlannerService } from '@domain/planner/planner.service';
import { PrismaService } from '@infra/database/prisma.service';
import { AuditService } from '@domain/audit/audit.service';
import { TaskPriority, TaskStatus } from '@shared/types';
import { testPrisma, createTestGuild, createTestUser } from '../setup';

describe('Task Lifecycle Integration', () => {
  let taskService: TaskService;
  let plannerService: PlannerService;
  let guildId: string;
  let userId: string;

  beforeAll(async () => {
    const guild = await createTestGuild();
    const user = await createTestUser(guild.id);
    guildId = guild.id;
    userId = user.id;
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
    // Then ensure user exists - create if doesn't exist
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskService,
        PlannerService,
        {
          provide: PrismaService,
          useValue: testPrisma,
        },
        {
          provide: AuditService,
          useValue: {
            logAction: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    taskService = module.get<TaskService>(TaskService);
    plannerService = module.get<PlannerService>(PlannerService);
  });

  it('should complete full task lifecycle with sprint assignment', async () => {
    // Step 1: Create sprint
    const sprint = await plannerService.createSprint(
      guildId,
      'Sprint 1',
      '2024-01-01',
      '2024-01-14',
      ['Goal 1'],
    );

    // Step 2: Create task
    const task = await taskService.createTask(
      guildId,
      userId,
      'Sprint Task',
      userId,
      'Description',
      '2024-01-10',
      TaskPriority.HIGH,
    );

    // Step 3: Assign to sprint
    await plannerService.assignTaskToSprint(guildId, sprint.id, task.id);

    // Step 4: Update task status
    await taskService.updateTask(task.id, TaskStatus.IN_PROGRESS);

    // Step 5: Complete task
    await taskService.updateTask(task.id, TaskStatus.COMPLETED);

    // Verify final state
    const completed = await testPrisma.task.findUnique({ where: { id: task.id } });
    expect(completed?.status).toBe('Completed');
    expect(completed?.completedAt).toBeDefined();
  });
});
