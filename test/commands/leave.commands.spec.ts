/**
 * Leave Commands Tests
 */

import { Test } from '@nestjs/testing';
import { LeaveCommands } from '@bot/commands/leave.commands';
import { LeaveService } from '@domain/hrms/leave.service';
import { AuditService } from '@domain/audit/audit.service';
import { DiscordService } from '@infra/discord/discord.service';
import { PrismaService } from '@infra/database/prisma.service';
import { ChatInputCommandInteraction } from 'discord.js';

describe('LeaveCommands', () => {
  let commands: LeaveCommands;
  let mockLeaveService: jest.Mocked<LeaveService>;
  let mockAuditService: jest.Mocked<AuditService>;
  let mockDiscordService: jest.Mocked<DiscordService>;
  let mockPrismaService: jest.Mocked<PrismaService>;
  let mockInteraction: Partial<ChatInputCommandInteraction>;

  beforeEach(() => {
    mockLeaveService = {
      applyForLeave: jest.fn(),
      getLeaveBalance: jest.fn(),
      approveLeave: jest.fn(),
      rejectLeave: jest.fn(),
      getLeaveCalendar: jest.fn(),
      getUserLeaveHistory: jest.fn(),
    } as any;

    mockAuditService = {
      logAction: jest.fn(),
    } as any;

    mockDiscordService = {} as any;
    mockPrismaService = {} as any;

    commands = new LeaveCommands(
      mockLeaveService,
      mockAuditService,
      mockDiscordService,
      mockPrismaService,
    );

    mockInteraction = {
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
      guildId: 'test-guild',
      user: { id: 'test-user' },
      options: {
        getSubcommand: jest.fn(),
        getString: jest.fn(),
        getUser: jest.fn(),
      },
    } as any;
  });

  describe('getCommands', () => {
    it('should return leave command with all subcommands', () => {
      const commandsList = LeaveCommands.getCommands();

      expect(commandsList.length).toBe(1);
      expect(commandsList[0].name).toBe('leave');
    });
  });

  describe('handleApply', () => {
    it('should handle leave application', async () => {
      (mockInteraction.options?.getSubcommand as jest.Mock).mockReturnValue('apply');
      (mockInteraction.options?.getString as jest.Mock).mockImplementation((name: string) => {
        if (name === 'type') return 'Sick Leave';
        if (name === 'startdate') return '2024-02-01';
        if (name === 'enddate') return '2024-02-03';
        if (name === 'reason') return 'Sick';
        return null;
      });

      mockLeaveService.applyForLeave.mockResolvedValue({
        applicationId: 'leave-1',
        status: 'Pending',
      } as any);

      await commands.handleApply(mockInteraction as ChatInputCommandInteraction);

      expect(mockInteraction.deferReply).toHaveBeenCalled();
      expect(mockLeaveService.applyForLeave).toHaveBeenCalled();
    });
  });

  describe('handleBalance', () => {
    it('should handle leave balance query', async () => {
      (mockInteraction.options?.getSubcommand as jest.Mock).mockReturnValue('balance');

      mockLeaveService.getLeaveBalance.mockResolvedValue({
        sick: 12,
        casual: 12,
        earned: 15,
        unpaid: 0,
      } as any);

      await commands.handleBalance(mockInteraction as ChatInputCommandInteraction);

      expect(mockLeaveService.getLeaveBalance).toHaveBeenCalled();
    });
  });
});
