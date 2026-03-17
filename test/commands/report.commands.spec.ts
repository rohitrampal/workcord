/**
 * Report Commands Tests
 */

import { ReportCommands } from '@bot/commands/report.commands';
import { ReportingService } from '@domain/reporting/reporting.service';
import { ChatInputCommandInteraction } from 'discord.js';

describe('ReportCommands', () => {
  let commands: ReportCommands;
  let mockReportingService: jest.Mocked<ReportingService>;
  let mockInteraction: Partial<ChatInputCommandInteraction>;

  beforeEach(() => {
    mockReportingService = {
      generateAttendanceReport: jest.fn(),
      generateLeaveReport: jest.fn(),
      generateTaskReport: jest.fn(),
      generateComplianceReport: jest.fn(),
    } as any;

    commands = new ReportCommands(mockReportingService);

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
    it('should return report command with subcommands', () => {
      const commandsList = ReportCommands.getCommands();

      expect(commandsList.length).toBe(1);
      expect(commandsList[0].name).toBe('report');
    });
  });

  describe('handleAttendanceReport', () => {
    it('should generate attendance report', async () => {
      (mockInteraction.options?.getSubcommand as jest.Mock).mockReturnValue('attendance');
      (mockInteraction.options?.getString as jest.Mock).mockImplementation((name: string) => {
        if (name === 'type') return 'daily';
        return null;
      });

      mockReportingService.generateAttendanceReport.mockResolvedValue({
        summary: {},
        records: [],
      } as any);

      await commands.handleAttendance(mockInteraction as ChatInputCommandInteraction);

      expect(mockReportingService.generateAttendanceReport).toHaveBeenCalled();
    });
  });
});
