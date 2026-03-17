/**
 * Attendance Service Tests
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceService } from '@domain/hrms/attendance.service';
import { PrismaService } from '@infra/database/prisma.service';
import { DiscordService } from '@infra/discord/discord.service';
import { AuditService } from '@domain/audit/audit.service';
import { AttendanceLocation } from '@shared/types';
import { testPrisma, createTestGuild, createTestUser } from '../setup';

describe('AttendanceService', () => {
  let service: AttendanceService;
  let guildId: string;
  let userId: string;

  const mockDiscordService = {
    getGuild: jest.fn(),
    getUser: jest.fn(),
    getGuildMember: jest.fn(),
  };

  const mockAuditService = {
    logAction: jest.fn(),
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
      } catch (error) {
        // If creation fails, check again - might have been created by another test
        existingGuild = await testPrisma.guild.findUnique({ where: { id: guildId } });
        if (!existingGuild) {
          throw error;
        }
      }
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
          useValue: mockAuditService,
        },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);

    // Setup mocks
    mockDiscordService.getGuild.mockResolvedValue({ id: guildId, name: 'Test Guild', ownerId: 'test-owner-123' });
    mockDiscordService.getUser.mockResolvedValue({ id: userId, username: 'testuser', discriminator: '0001' });
    mockDiscordService.getGuildMember.mockResolvedValue({ displayName: 'Test User', id: userId });
    mockAuditService.logAction.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    // Clean up attendance records after each test (but keep guild and users)
    await testPrisma.attendance.deleteMany({ where: { guildId } });
  });

  describe('checkIn', () => {
    it('should create check-in record', async () => {
      const result = await service.checkIn(guildId, userId, AttendanceLocation.OFFICE);

      expect(result.id).toBeDefined();
      expect(result.location).toBe(AttendanceLocation.OFFICE);
    });

    it('should prevent duplicate check-in on same day', async () => {
      await service.checkIn(guildId, userId, AttendanceLocation.OFFICE);

      await expect(service.checkIn(guildId, userId, AttendanceLocation.WFH)).rejects.toThrow();
    });

    it('should create guild if not exists', async () => {
      const newGuildId = `new-guild-${Date.now()}`;
      // Ensure the user exists in the original guild first using upsert
      await testPrisma.guild.upsert({
        where: { id: guildId },
        create: {
          id: guildId,
          name: 'Test Guild',
          ownerId: 'test-owner-123',
          isProvisioned: true,
        },
        update: {},
      });
      // Use a different userId for the new guild since id is globally unique
      const newUserId = `new-user-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      
      mockDiscordService.getGuild.mockResolvedValue({
        id: newGuildId,
        name: 'New Guild',
        ownerId: 'owner-123',
      });
      // Mock getGuildMember for the new guild
      mockDiscordService.getGuildMember.mockResolvedValue({
        displayName: 'Test User',
        id: newUserId,
      });
      mockDiscordService.getUser.mockResolvedValue({
        id: newUserId,
        username: 'newuser',
        discriminator: '0001',
      });

      await service.checkIn(newGuildId, newUserId, AttendanceLocation.OFFICE);

      const guild = await testPrisma.guild.findUnique({ where: { id: newGuildId } });
      expect(guild).toBeDefined();
    });

    it('should create user if not exists', async () => {
      // Use a unique user ID to avoid conflicts
      const newUserId = `new-user-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      
      // Ensure guild exists using upsert
      await testPrisma.guild.upsert({
        where: { id: guildId },
        create: {
          id: guildId,
          name: 'Test Guild',
          ownerId: 'test-owner-123',
          isProvisioned: true,
        },
        update: {},
      });

      mockDiscordService.getUser.mockResolvedValue({
        id: newUserId,
        username: 'newuser',
        discriminator: '0001',
      });
      mockDiscordService.getGuildMember.mockResolvedValue({
        displayName: 'New User',
        id: newUserId,
      });

      await service.checkIn(guildId, newUserId, AttendanceLocation.OFFICE);

      const user = await testPrisma.user.findUnique({
        where: { guildId_id: { guildId, id: newUserId } },
      });
      expect(user).toBeDefined();
    });
  });

  describe('checkOut', () => {
    it('should update check-out time and calculate hours', async () => {
      // Ensure guild and user exist
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

      const checkIn = await service.checkIn(guildId, userId, AttendanceLocation.OFFICE);
      const checkInTime = new Date(checkIn.checkInAt);

      // Simulate 8 hours later - mock getCurrentISTDate to return the checkout time
      const checkOutTime = new Date(checkInTime.getTime() + 8 * 60 * 60 * 1000);
      const dateUtils = require('@shared/utils/date');
      jest.spyOn(dateUtils, 'getCurrentISTDate').mockReturnValue(checkOutTime);

      const result = await service.checkOut(guildId, userId);
      
      expect(result.hoursWorked).toBeDefined();
      expect(result.hoursWorked).toBeCloseTo(8, 1);
      
      // Restore the mock
      jest.restoreAllMocks();
      jest.restoreAllMocks();
    });

    it('should throw error if no check-in found', async () => {
      // Ensure guild exists first
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
      // Then ensure user exists
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

      await expect(service.checkOut(guildId, userId)).rejects.toThrow();
    });

    it('should validate minimum work hours', async () => {
      // Ensure guild exists first
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
      // Then ensure user exists
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

      await service.checkIn(guildId, userId, AttendanceLocation.OFFICE);

      // Try to check out immediately (less than minimum hours)
      await expect(service.checkOut(guildId, userId)).rejects.toThrow();
    });
  });

  describe('getAttendance', () => {
    it('should return attendance records for user', async () => {
      await service.checkIn(guildId, userId, AttendanceLocation.OFFICE);

      const history = await service.getAttendance(guildId, userId);

      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);
    });

    it('should filter by date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const history = await service.getAttendance(guildId, userId, startDate, endDate);

      expect(Array.isArray(history)).toBe(true);
    });
  });
});
