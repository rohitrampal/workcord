/**
 * Test Helper Utilities
 */

import { PrismaClient } from '@prisma/client';

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const createMockInteraction = (overrides = {}) => {
  return {
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
    guildId: 'test-guild',
    user: { id: 'test-user', tag: 'testuser#0001' },
    options: {
      getString: jest.fn(),
      getUser: jest.fn(),
      getInteger: jest.fn(),
      getBoolean: jest.fn(),
    },
    ...overrides,
  };
};

export const createMockDiscordGuild = (overrides = {}) => {
  return {
    id: 'test-guild',
    name: 'Test Guild',
    ownerId: 'owner-123',
    members: {
      fetch: jest.fn(),
    },
    channels: {
      fetch: jest.fn(),
    },
    roles: {
      create: jest.fn(),
      fetch: jest.fn(),
    },
    ...overrides,
  };
};

export const createMockDiscordUser = (overrides = {}) => {
  return {
    id: 'test-user',
    username: 'testuser',
    discriminator: '0001',
    send: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
};

export const createMockDiscordChannel = (overrides = {}) => {
  return {
    id: 'test-channel',
    name: 'test-channel',
    send: jest.fn().mockResolvedValue(undefined),
    isTextBased: jest.fn().mockReturnValue(true),
    ...overrides,
  };
};

export const waitForDatabase = async (prisma: PrismaClient, maxRetries = 10) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(1000);
    }
  }
};
