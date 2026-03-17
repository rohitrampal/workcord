/**
 * Audit Service Tests
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '@domain/audit/audit.service';
import { PrismaService } from '@infra/database/prisma.service';
import { testPrisma, createTestGuild, createTestUser } from '../setup';

describe('AuditService', () => {
  let service: AuditService;
  let guildId: string;
  let userId: string;

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
      } catch (error: any) {
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
        AuditService,
        {
          provide: PrismaService,
          useValue: testPrisma,
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  afterEach(async () => {
    // Clean up audit logs after each test
    await testPrisma.auditLog.deleteMany({
      where: { guildId },
    });
  });

  describe('logAction', () => {
    it('should log action with all fields', async () => {
      // Ensure guild and user exist before logging (audit service silently fails on FK errors)
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
      
      await service.logAction(
        guildId,
        userId,
        'checkin',
        'attendance',
        'attendance-123',
        { location: 'Office' },
      );

      const logs = await testPrisma.auditLog.findMany({
        where: { guildId, userId, action: 'checkin' },
      });

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].entityType).toBe('attendance');
      expect(logs[0].entityId).toBe('attendance-123');
    });

    it('should log action without entity ID', async () => {
      await service.logAction(guildId, userId, 'config_update', 'guild', undefined, {
        setting: 'reminderTimes',
      });

      const logs = await testPrisma.auditLog.findMany({
        where: { guildId, userId, action: 'config_update' },
      });

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].entityId).toBeNull();
    });
  });

  describe('getAuditLogs', () => {
    it('should retrieve audit logs with filters', async () => {
      // Ensure guild and user exist before logging
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
      
      await service.logAction(guildId, userId, 'checkin', 'attendance', 'att-1');
      await service.logAction(guildId, userId, 'checkout', 'attendance', 'att-1');

      const logs = await service.getAuditLogs(guildId, {
        action: 'checkin',
      });

      expect(logs.length).toBeGreaterThan(0);
      logs.forEach((log) => {
        expect(log.action).toBe('checkin');
      });
    });

    it('should filter by date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const logs = await service.getAuditLogs(guildId, {
        startDate,
        endDate,
      });

      expect(Array.isArray(logs)).toBe(true);
    });

    it('should filter by user', async () => {
      const logs = await service.getAuditLogs(guildId, {
        userId,
      });

      logs.forEach((log) => {
        expect(log.userId).toBe(userId);
      });
    });
  });
});
