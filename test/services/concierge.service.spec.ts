/**
 * Concierge Service Tests
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConciergeService } from '@domain/concierge/concierge.service';
import { PrismaService } from '@infra/database/prisma.service';
import { DiscordService } from '@infra/discord/discord.service';
import { testPrisma, createTestGuild, createTestUser } from '../setup';

describe('ConciergeService', () => {
  let service: ConciergeService;
  let guildId: string;
  let userId: string;

  beforeAll(async () => {
    // Just set IDs, don't create records yet
    guildId = `test-guild-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    userId = `test-user-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  });

  const mockDiscordService = {
    getGuild: jest.fn(),
    getUser: jest.fn(),
    createChannel: jest.fn(),
  };

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
        // If creation fails, check again - might have been created by another test
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
        ConciergeService,
        {
          provide: PrismaService,
          useValue: testPrisma,
        },
        {
          provide: DiscordService,
          useValue: mockDiscordService,
        },
      ],
    }).compile();

    service = module.get<ConciergeService>(ConciergeService);

    // Setup mocks
    const mockChannel = {
      id: 'channel-id',
      name: 'concierge-channel',
      send: jest.fn().mockResolvedValue({ id: 'message-id' }),
    };

    const mockGuild = {
      id: guildId,
      name: 'Test Guild',
      ownerId: 'test-owner-123',
      channels: {
        create: jest.fn().mockResolvedValue(mockChannel),
      },
      roles: {
        everyone: {
          id: 'everyone-role-id',
        },
      },
    };

    mockDiscordService.getGuild.mockResolvedValue(mockGuild);
    mockDiscordService.getUser.mockResolvedValue({ id: userId, username: 'testuser' });
    mockDiscordService.createChannel.mockResolvedValue(mockChannel);
  });

  describe('getPersonalStats', () => {
    it('should return personal statistics for user', async () => {
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

      // Create test data
      await testPrisma.attendance.create({
        data: {
          guildId,
          userId,
          date: new Date(),
          checkInAt: new Date(),
          location: 'Office',
        },
      });

      await testPrisma.task.create({
        data: {
          guildId,
          assigneeId: userId,
          creatorId: userId,
          title: 'Test Task',
          status: 'In Progress',
        },
      });

      const stats = await service.getPersonalStats(guildId, userId);

      expect(stats).toBeDefined();
      expect(stats.attendance).toBeDefined();
      expect(stats.tasks).toBeDefined();
      expect(stats.leaves).toBeDefined();
    });
  });

  afterEach(async () => {
    jest.clearAllMocks();
    // Clean up test data (but keep guild and users)
    await testPrisma.conciergeChannel.deleteMany({ where: { guildId } });
    await testPrisma.attendance.deleteMany({ where: { guildId } });
    await testPrisma.task.deleteMany({ where: { guildId } });
  });

  describe('createConciergeChannel', () => {
    it('should create concierge channel for user', async () => {
      // Ensure guild exists (should already exist from beforeEach, but ensure for safety)
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
      // Ensure user exists (should already exist from beforeEach, but ensure for safety)
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

      const result = await service.createConciergeChannel(guildId, userId);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });
});
