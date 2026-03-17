/**
 * Planner Commands Tests
 */

import { PlannerCommands } from '@bot/commands/planner.commands';
import { PlannerService } from '@domain/planner/planner.service';
import { AuditService } from '@domain/audit/audit.service';
import { ChatInputCommandInteraction } from 'discord.js';

describe('PlannerCommands', () => {
  let commands: PlannerCommands;
  let mockPlannerService: jest.Mocked<PlannerService>;
  let mockAuditService: jest.Mocked<AuditService>;
  let mockInteraction: Partial<ChatInputCommandInteraction>;

  beforeEach(() => {
    mockPlannerService = {
      createSprint: jest.fn(),
      getSprintStatus: jest.fn(),
      assignTaskToSprint: jest.fn(),
      completeSprint: jest.fn(),
      createGoal: jest.fn(),
      updateGoalProgress: jest.fn(),
      listGoals: jest.fn(),
    } as any;

    mockAuditService = {
      logAction: jest.fn(),
    } as any;

    commands = new PlannerCommands(mockPlannerService, mockAuditService);

    mockInteraction = {
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
      guildId: 'test-guild',
      user: { id: 'test-user' },
      options: {
        getSubcommandGroup: jest.fn(),
        getSubcommand: jest.fn(),
        getString: jest.fn(),
        getInteger: jest.fn(),
      },
    } as any;
  });

  describe('getCommands', () => {
    it('should return sprint and goal commands', () => {
      const commandsList = PlannerCommands.getCommands();

      expect(commandsList.length).toBe(2);
      expect(commandsList[0].name).toBe('sprint');
      expect(commandsList[1].name).toBe('goal');
    });
  });
});
