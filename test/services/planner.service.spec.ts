/**
 * Planner Service Tests
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PlannerService } from '@domain/planner/planner.service';
import { PrismaService } from '@infra/database/prisma.service';
import { AuditService } from '@domain/audit/audit.service';
import { testPrisma, createTestGuild } from '../setup';

describe('PlannerService', () => {
  let service: PlannerService;
  let guildId: string;

  const mockAuditService = {
    logAction: jest.fn(),
  };

  beforeAll(async () => {
    // Just set ID, don't create record yet
    guildId = `test-guild-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  });

  beforeEach(async () => {
    // Ensure guild exists - create if doesn't exist
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlannerService,
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

    service = module.get<PlannerService>(PlannerService);
    mockAuditService.logAction.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    // Clean up active sprints and goals to avoid conflicts (but keep guild)
    await testPrisma.plannerPlan.updateMany({
      where: { guildId, status: 'Active' },
      data: { status: 'Completed' },
    });
    await testPrisma.plannerPlan.deleteMany({ where: { guildId } });
  });

  describe('createSprint', () => {
    it('should create sprint with goals', async () => {
      // Use future dates
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      const startDate = futureDate.toISOString().split('T')[0];
      futureDate.setDate(futureDate.getDate() + 13);
      const endDate = futureDate.toISOString().split('T')[0];

      const result = await service.createSprint(
        guildId,
        'Sprint 1',
        startDate,
        endDate,
        ['Goal 1', 'Goal 2'],
      );

      expect(result.id).toBeDefined();
      expect(result.name).toBe('Sprint 1');
      expect(result.status).toBe('Active');
    });

    it('should enforce one active sprint limit', async () => {
      // Use future dates
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 20);
      const startDate1 = futureDate.toISOString().split('T')[0];
      futureDate.setDate(futureDate.getDate() + 13);
      const endDate1 = futureDate.toISOString().split('T')[0];

      futureDate.setDate(futureDate.getDate() + 1);
      const startDate2 = futureDate.toISOString().split('T')[0];
      futureDate.setDate(futureDate.getDate() + 13);
      const endDate2 = futureDate.toISOString().split('T')[0];

      await service.createSprint(guildId, 'Sprint 1', startDate1, endDate1);

      await expect(
        service.createSprint(guildId, 'Sprint 2', startDate2, endDate2),
      ).rejects.toThrow();
    });
  });

  describe('getSprintStatus', () => {
    it('should return sprint status with progress', async () => {
      // Use future dates
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const startDate = futureDate.toISOString().split('T')[0];
      futureDate.setDate(futureDate.getDate() + 13);
      const endDate = futureDate.toISOString().split('T')[0];

      const sprint = await service.createSprint(guildId, 'Status Sprint', startDate, endDate);

      const status = await service.getSprintStatus(guildId, sprint.id);

      expect(status).toBeDefined();
      expect(status.progress).toBeDefined();
      expect(status.tasks).toBeDefined();
    });
  });

  describe('createGoal', () => {
    it('should create OKR goal with key results', async () => {
      // Use future date (at least 1 year from now)
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const dueDate = futureDate.toISOString().split('T')[0];

      const result = await service.createGoal(
        guildId,
        'Increase Revenue',
        ['KR1', 'KR2', 'KR3'],
        dueDate,
        'Description',
      );

      expect(result.id).toBeDefined();
      expect(result.objective).toBe('Increase Revenue');
      expect(result.status).toBeDefined();
    });
  });

  describe('updateGoalProgress', () => {
    it('should update key result progress', async () => {
      // Use future date
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const dueDate = futureDate.toISOString().split('T')[0];

      const goal = await service.createGoal(
        guildId,
        'Test Goal',
        ['KR1', 'KR2'],
        dueDate,
      );

      await service.updateGoalProgress(guildId, goal.id, 1, 50);

      // Verify the update by fetching the goal
      const updatedGoal = await testPrisma.plannerPlan.findUnique({
        where: { id: goal.id },
      });
      expect(updatedGoal).toBeDefined();
      // Key results are stored in metadata
      expect(updatedGoal?.metadata).toBeDefined();
    });
  });
});
