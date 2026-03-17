/**
 * Attendance Commands Tests
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceCommands } from '@bot/commands/attendance.commands';
import { AttendanceService } from '@domain/hrms/attendance.service';
import { AuditService } from '@domain/audit/audit.service';
import { DiscordService } from '@infra/discord/discord.service';
import { ChatInputCommandInteraction } from 'discord.js';

describe('AttendanceCommands', () => {
  let commands: AttendanceCommands;
  let mockAttendanceService: jest.Mocked<AttendanceService>;
  let mockAuditService: jest.Mocked<AuditService>;
  let mockDiscordService: jest.Mocked<DiscordService>;
  let mockInteraction: Partial<ChatInputCommandInteraction>;

  beforeEach(async () => {
    mockAttendanceService = {
      checkIn: jest.fn(),
      checkOut: jest.fn(),
    } as any;

    mockAuditService = {
      logAction: jest.fn(),
    } as any;

    mockDiscordService = {} as any;

    commands = new AttendanceCommands(mockAttendanceService, mockAuditService, mockDiscordService);

    mockInteraction = {
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
      guildId: 'test-guild',
      user: { id: 'test-user' },
      options: {
        getString: jest.fn().mockReturnValue('Office'),
      },
    } as any;
  });

  describe('getCommands', () => {
    it('should return checkin and checkout commands', () => {
      const commandsList = AttendanceCommands.getCommands();

      expect(commandsList.length).toBe(2);
      expect(commandsList[0].name).toBe('checkin');
      expect(commandsList[1].name).toBe('checkout');
    });
  });

  describe('handleCheckIn', () => {
    it('should handle check-in command successfully', async () => {
      mockAttendanceService.checkIn.mockResolvedValue({
        id: 'attendance-1',
        location: 'Office',
        checkInTime: new Date(),
      } as any);

      await commands.handleCheckIn(mockInteraction as ChatInputCommandInteraction);

      expect(mockInteraction.deferReply).toHaveBeenCalled();
      expect(mockAttendanceService.checkIn).toHaveBeenCalledWith(
        'test-guild',
        'test-user',
        'Office',
      );
      expect(mockAuditService.logAction).toHaveBeenCalled();
    });

    it('should handle check-in errors gracefully', async () => {
      mockAttendanceService.checkIn.mockRejectedValue(new Error('Already checked in'));

      await commands.handleCheckIn(mockInteraction as ChatInputCommandInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalled();
    });
  });

  describe('handleCheckOut', () => {
    it('should handle check-out command successfully', async () => {
      mockAttendanceService.checkOut.mockResolvedValue({
        id: 'attendance-1',
        totalHours: 8,
        checkOutTime: new Date(),
      } as any);

      await commands.handleCheckOut(mockInteraction as ChatInputCommandInteraction);

      expect(mockInteraction.deferReply).toHaveBeenCalled();
      expect(mockAttendanceService.checkOut).toHaveBeenCalledWith('test-guild', 'test-user');
    });

    it('should handle check-out errors gracefully', async () => {
      mockAttendanceService.checkOut.mockRejectedValue(new Error('No check-in found'));

      await commands.handleCheckOut(mockInteraction as ChatInputCommandInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalled();
    });
  });
});
