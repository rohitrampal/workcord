/**
 * Integration Tests - Leave Workflow
 * Tests the complete leave application and approval flow
 */

import { Test, TestingModule } from '@nestjs/testing';
import { LeaveService } from '@domain/hrms/leave.service';
import { PrismaService } from '@infra/database/prisma.service';
import { DiscordService } from '@infra/discord/discord.service';
import { AuditService } from '@domain/audit/audit.service';
import { LeaveType } from '@shared/types';
import { testPrisma, createTestGuild, createTestUser } from '../setup';

describe('Leave Workflow Integration', () => {
  let leaveService: LeaveService;
  let guildId: string;
  let userId: string;
  let adminId: string;

  const mockDiscordService = {
    getGuild: jest.fn(),
  };

  beforeAll(async () => {
    const guild = await createTestGuild({
      leaveQuotas: {
        sick: 12,
        casual: 12,
        earned: 15,
        unpaid: 0,
      } as any,
    });
    const user = await createTestUser(guild.id);
    const admin = await createTestUser(guild.id, { id: 'admin-123' });
    guildId = guild.id;
    userId = user.id;
    adminId = admin.id;

    mockDiscordService.getGuild.mockResolvedValue({ id: guildId, name: 'Test Guild' });
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
          leaveQuotas: {
            sick: 12,
            casual: 12,
            earned: 15,
            unpaid: 0,
          } as any,
        },
      });
    }
    // Then ensure users exist - create if doesn't exist
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
    const existingAdmin = await testPrisma.user.findUnique({
      where: { guildId_id: { guildId, id: adminId } },
    });
    if (!existingAdmin) {
      await testPrisma.user.create({
        data: {
          id: adminId,
          guildId,
          username: 'admin',
          discriminator: '0001',
        },
      });
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaveService,
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

    leaveService = module.get<LeaveService>(LeaveService);
  });

  it('should complete full leave application and approval flow', async () => {
    // Step 1: Apply for leave
    const application = await leaveService.applyForLeave(
      guildId,
      userId,
      LeaveType.SICK_LEAVE,
      '2024-07-01',
      '2024-07-03',
      'Sick',
    );

    expect(application.applicationId).toBeDefined();
    expect(application.status).toBe('Pending');

    // Verify in database
    const dbLeave = await testPrisma.leave.findUnique({
      where: { id: application.applicationId },
    });
    expect(dbLeave).toBeDefined();
    expect(dbLeave?.status).toBe('Pending');

    // Step 2: Approve leave
    const approved = await leaveService.approveLeave(guildId, application.applicationId, adminId);

    expect(approved.status).toBe('Approved');

    // Verify in database
    const updatedLeave = await testPrisma.leave.findUnique({
      where: { id: application.applicationId },
    });
    expect(updatedLeave?.status).toBe('Approved');
    expect(updatedLeave?.approvedBy).toBe(adminId);
  });

  it('should complete leave rejection flow', async () => {
    const application = await leaveService.applyForLeave(
      guildId,
      userId,
      LeaveType.CASUAL_LEAVE,
      '2024-08-01',
      '2024-08-02',
      'Personal',
    );

    const rejected = await leaveService.rejectLeave(
      guildId,
      application.applicationId,
      adminId,
      'Insufficient balance',
    );

    expect(rejected.status).toBe('Rejected');
    // Verify rejection reason in database
    const dbRejected = await testPrisma.leave.findUnique({
      where: { applicationId: rejected.applicationId },
    });
    expect(dbRejected?.rejectionReason).toBe('Insufficient balance');
  });

  it('should update leave balance after approval', async () => {
    const initialBalance = await leaveService.getLeaveBalance(guildId, userId, LeaveType.SICK_LEAVE);

    const application = await leaveService.applyForLeave(
      guildId,
      userId,
      LeaveType.SICK_LEAVE,
      '2024-09-01',
      '2024-09-01', // 1 day
      'Sick',
    );

    await leaveService.approveLeave(guildId, application.applicationId, adminId);

    const updatedBalance = await leaveService.getLeaveBalance(guildId, userId, LeaveType.SICK_LEAVE);

    expect(updatedBalance).toBe(initialBalance - 1);
  });
});
