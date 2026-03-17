/**
 * Provisioning Service Tests
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ProvisioningService } from '@domain/provisioning/provisioning.service';
import { PrismaService } from '@infra/database/prisma.service';
import { DiscordService } from '@infra/discord/discord.service';
import { testPrisma } from '../setup';

describe('ProvisioningService', () => {
  let service: ProvisioningService;

  const mockDiscordService = {
    getGuild: jest.fn(),
    createRole: jest.fn(),
    createChannel: jest.fn(),
    sendMessage: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProvisioningService,
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

    service = module.get<ProvisioningService>(ProvisioningService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    // Clean up test data (but keep guilds as they may be used by other tests)
    await testPrisma.role.deleteMany({});
    await testPrisma.channel.deleteMany({});
  });

  describe('provisionGuild', () => {
    it('should create all required roles', async () => {
      const guildId = `test-guild-${Date.now()}`;
      // Create guild first
      await testPrisma.guild.create({
        data: {
          id: guildId,
          name: 'Test Guild',
          ownerId: 'owner-123',
          isProvisioned: false,
        },
      });

      // Setup mocks for this test - each role needs a unique ID
      let roleCounter = 0;
      const mockRolesCreate = jest.fn().mockImplementation(() => {
        roleCounter++;
        return Promise.resolve({
          id: `role-id-${guildId}-${roleCounter}-${Date.now()}`,
          name: 'Role Name',
          permissions: {
            toArray: jest.fn().mockReturnValue(['ViewChannels', 'SendMessages']),
          },
        });
      });
      let channelCounter = 0;
      const mockChannelsCreate = jest.fn().mockImplementation(() => {
        channelCounter++;
        return Promise.resolve({ 
          id: `channel-id-${guildId}-${channelCounter}-${Date.now()}`, 
          name: 'channel' 
        });
      });

      mockDiscordService.getGuild.mockResolvedValue({
        id: guildId,
        name: 'Test Guild',
        ownerId: 'owner-123',
        roles: {
          cache: {
            find: jest.fn().mockReturnValue(null),
          },
          create: mockRolesCreate,
        },
        channels: {
          cache: {
            find: jest.fn().mockReturnValue(null),
          },
          create: mockChannelsCreate,
        },
      });

      await service.provisionGuild(guildId);

      // Check that roles.create was called 7 times (7 roles)
      expect(mockRolesCreate).toHaveBeenCalledTimes(7);
    });

    it('should create all required channels', async () => {
      const guildId = `test-guild-${Date.now()}`;
      // Create guild first
      await testPrisma.guild.create({
        data: {
          id: guildId,
          name: 'Test Guild',
          ownerId: 'owner-123',
          isProvisioned: false,
        },
      });

      // Setup mocks for this test - each role needs a unique ID
      let roleCounter = 0;
      const mockRolesCreate = jest.fn().mockImplementation(() => {
        roleCounter++;
        return Promise.resolve({
          id: `role-id-${guildId}-${roleCounter}-${Date.now()}`,
          name: 'Role Name',
          permissions: {
            toArray: jest.fn().mockReturnValue(['ViewChannels', 'SendMessages']),
          },
        });
      });
      let channelCounter = 0;
      const mockChannelsCreate = jest.fn().mockImplementation(() => {
        channelCounter++;
        return Promise.resolve({ 
          id: `channel-id-${guildId}-${channelCounter}-${Date.now()}`, 
          name: 'channel' 
        });
      });

      mockDiscordService.getGuild.mockResolvedValue({
        id: guildId,
        name: 'Test Guild',
        ownerId: 'owner-123',
        roles: {
          cache: {
            find: jest.fn().mockReturnValue(null),
          },
          create: mockRolesCreate,
        },
        channels: {
          cache: {
            find: jest.fn().mockReturnValue(null),
          },
          create: mockChannelsCreate,
        },
      });

      await service.provisionGuild(guildId);

      // Check that channels.create was called 9 times (9 channels)
      expect(mockChannelsCreate).toHaveBeenCalledTimes(9);
    });

    it('should mark guild as provisioned', async () => {
      const guildId = `test-guild-${Date.now()}`;
      // Create guild first
      await testPrisma.guild.create({
        data: {
          id: guildId,
          name: 'Test Guild',
          ownerId: 'owner-123',
          isProvisioned: false,
        },
      });

      // Setup mocks for this test - each role needs a unique ID
      let roleCounter = 0;
      const mockRolesCreate = jest.fn().mockImplementation(() => {
        roleCounter++;
        return Promise.resolve({
          id: `role-id-${guildId}-${roleCounter}-${Date.now()}`,
          name: 'Role Name',
          permissions: {
            toArray: jest.fn().mockReturnValue(['ViewChannels', 'SendMessages']),
          },
        });
      });
      let channelCounter = 0;
      const mockChannelsCreate = jest.fn().mockImplementation(() => {
        channelCounter++;
        return Promise.resolve({ 
          id: `channel-id-${guildId}-${channelCounter}-${Date.now()}`, 
          name: 'channel' 
        });
      });

      mockDiscordService.getGuild.mockResolvedValue({
        id: guildId,
        name: 'Test Guild',
        ownerId: 'owner-123',
        roles: {
          cache: {
            find: jest.fn().mockReturnValue(null),
          },
          create: mockRolesCreate,
        },
        channels: {
          cache: {
            find: jest.fn().mockReturnValue(null),
          },
          create: mockChannelsCreate,
        },
      });

      await service.provisionGuild(guildId);

      const guild = await testPrisma.guild.findUnique({ where: { id: guildId } });
      expect(guild?.isProvisioned).toBe(true);
    });
  });
});
