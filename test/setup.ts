/**
 * Test Setup
 * Global test configuration and utilities
 */

import { PrismaClient } from '@prisma/client';

// Global test database client
export const testPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
    },
  },
});

// Test data factories
export const createTestGuild = async (overrides = {}) => {
  return testPrisma.guild.create({
    data: {
      id: `test-guild-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      name: 'Test Guild',
      ownerId: 'test-owner-123',
      isProvisioned: true,
      ...overrides,
    },
  });
};

export const createTestUser = async (guildId: string, overrides = {}) => {
  // Ensure guild exists first - with retry logic
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
      // If creation fails (e.g., unique constraint), check again
      existingGuild = await testPrisma.guild.findUnique({ where: { id: guildId } });
      if (!existingGuild) {
        // Only throw if it's not a unique constraint error (P2002)
        if (error.code !== 'P2002') {
          throw error;
        }
        // For unique constraint, check one more time
        existingGuild = await testPrisma.guild.findUnique({ where: { id: guildId } });
        if (!existingGuild) {
          throw error;
        }
      }
    }
  }
  
  // Check if user already exists (if ID is provided in overrides)
  if (overrides && typeof overrides === 'object' && 'id' in overrides) {
    const existingUser = await testPrisma.user.findUnique({
      where: { guildId_id: { guildId, id: overrides.id as string } },
    });
    if (existingUser) {
      return existingUser;
    }
  }
  
  try {
    return await testPrisma.user.create({
      data: {
        id: `test-user-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        guildId,
        username: 'testuser',
        discriminator: '0001',
        ...overrides,
      },
    });
  } catch (error: any) {
    // If FK constraint error, ensure guild exists and retry
    if (error.code === 'P2003') {
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
      // Retry user creation
      return await testPrisma.user.create({
        data: {
          id: `test-user-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          guildId,
          username: 'testuser',
          discriminator: '0001',
          ...overrides,
        },
      });
    }
    throw error;
  }
};

export const createTestChannel = async (guildId: string, overrides = {}) => {
  return testPrisma.channel.create({
    data: {
      id: `test-channel-${Date.now()}`,
      guildId,
      name: 'test-channel',
      type: 'general',
      ...overrides,
    },
  });
};

// Cleanup helper
export const cleanupTestData = async () => {
  // Delete in reverse order of dependencies
  await testPrisma.auditLog.deleteMany({});
  await testPrisma.knowledgeArticle.deleteMany({});
  await testPrisma.hrTicket.deleteMany({});
  await testPrisma.conciergeChannel.deleteMany({});
  await testPrisma.leave.deleteMany({});
  await testPrisma.attendance.deleteMany({});
  await testPrisma.plannerPlan.deleteMany({});
  await testPrisma.task.deleteMany({});
  await testPrisma.update.deleteMany({});
  await testPrisma.todo.deleteMany({});
  await testPrisma.user.deleteMany({});
  await testPrisma.channel.deleteMany({});
  await testPrisma.role.deleteMany({});
  await testPrisma.guild.deleteMany({});
};

// Before all tests
beforeAll(async () => {
  // Connect to test database
  await testPrisma.$connect();
});

// After all tests
afterAll(async () => {
  await cleanupTestData();
  await testPrisma.$disconnect();
});

// Note: Individual test files should handle cleanup in their afterAll hooks
// Global beforeEach cleanup is disabled to avoid conflicts with beforeAll data creation
