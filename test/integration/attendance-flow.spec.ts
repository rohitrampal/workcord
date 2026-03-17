/**
 * Integration Tests - Attendance Flow
 * Tests the complete flow from command to database
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceService } from '@domain/hrms/attendance.service';
import { PrismaService } from '@infra/database/prisma.service';
import { DiscordService } from '@infra/discord/discord.service';
import { AuditService } from '@domain/audit/audit.service';
import { AttendanceLocation } from '@shared/types';
import { testPrisma, createTestGuild, createTestUser } from '../setup';

describe('Attendance Flow Integration', () => {
  let attendanceService: AttendanceService;
  let guildId: string;
  let userId: string;

  const mockDiscordService = {
    getGuild: jest.fn(),
    getUser: jest.fn(),
    getGuildMember: jest.fn(),
  };

  beforeAll(async () => {
    const guild = await createTestGuild();
    const user = await createTestUser(guild.id);
    guildId = guild.id;
    userId = user.id;

    mockDiscordService.getGuild.mockResolvedValue({ id: guildId, name: 'Test Guild' });
    mockDiscordService.getUser.mockResolvedValue({ id: userId, username: 'testuser' });
    mockDiscordService.getGuildMember.mockResolvedValue({ displayName: 'Test User' });
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
        AttendanceService,
        {
          provide: PrismaService,
          useValue: testPrisma,
        },
        {
          provide: DiscordService,
          useValue: mockDiscordService,
        },
        {
          provide: AuditService,
          useValue: {
            logAction: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    attendanceService = module.get<AttendanceService>(AttendanceService);
  });

  it('should complete full check-in and check-out flow', async () => {
    // Step 1: Check in
    const checkIn = await attendanceService.checkIn(guildId, userId, AttendanceLocation.OFFICE);

    expect(checkIn.id).toBeDefined();
    expect(checkIn.location).toBe(AttendanceLocation.OFFICE);

    // Verify in database
    const dbRecord = await testPrisma.attendance.findUnique({
      where: { id: checkIn.id },
    });
    expect(dbRecord).toBeDefined();
    expect(dbRecord?.checkInAt).toBeDefined();
    expect(dbRecord?.checkOutAt).toBeNull();

    // Step 2: Wait and check out (simulate 8 hours)
    const checkOutTime = new Date(checkIn.checkInAt);
    checkOutTime.setHours(checkOutTime.getHours() + 8);
    jest.spyOn(Date, 'now').mockReturnValue(checkOutTime.getTime());

    const checkOut = await attendanceService.checkOut(guildId, userId);

    expect(checkOut.hoursWorked).toBeDefined();
    expect(checkOut.hoursWorked).toBeCloseTo(8, 1);

    // Verify in database
    const updatedRecord = await testPrisma.attendance.findUnique({
      where: { id: checkIn.id },
    });
    expect(updatedRecord?.checkOutAt).toBeDefined();
    expect(updatedRecord?.hoursWorked).toBeCloseTo(8, 1);
  });

  it('should prevent duplicate check-in on same day', async () => {
    await attendanceService.checkIn(guildId, userId, AttendanceLocation.OFFICE);

    await expect(attendanceService.checkIn(guildId, userId, AttendanceLocation.WFH)).rejects.toThrow();
  });

  it('should track attendance history correctly', async () => {
    // Create multiple attendance records
    for (let i = 0; i < 5; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      await testPrisma.attendance.create({
        data: {
          guildId,
          userId,
          date,
          checkInAt: new Date(date.setHours(9, 0, 0, 0)),
          checkOutAt: new Date(date.setHours(17, 0, 0, 0)),
          location: 'Office',
          hoursWorked: 8,
        },
      });
    }

    const history = await attendanceService.getAttendance(guildId, userId);

    expect(history.length).toBeGreaterThanOrEqual(5);
  });
});
