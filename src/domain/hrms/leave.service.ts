import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@infra/database/prisma.service';
import { DiscordService } from '@infra/discord/discord.service';
import { NotFoundError, PermissionError, ConflictError } from '@shared/utils/errors';
import { parseISTDate, formatISTDate, isPastIST } from '@shared/utils/date';
import { LeaveType, LeaveStatus } from '@shared/types';

/**
 * Leave Service
 * Handles leave applications, approvals, and balance tracking
 */
@Injectable()
export class LeaveService {
  private readonly logger = new Logger(LeaveService.name);

  constructor(
    private prisma: PrismaService,
    private discord: DiscordService,
  ) {}

  /**
   * Ensure guild exists in database, create if it doesn't
   */
  private async ensureGuildExists(guildId: string): Promise<void> {
    try {
      const existingGuild = await this.prisma.guild.findUnique({
        where: { id: guildId },
      });

      if (existingGuild) {
        return;
      }

      // Fetch guild from Discord
      const discordGuild = await this.discord.getGuild(guildId);
      if (!discordGuild) {
        throw new NotFoundError('Guild not found in Discord');
      }

      // Create minimal guild record
      await this.prisma.guild.create({
        data: {
          id: guildId,
          name: discordGuild.name,
          ownerId: discordGuild.ownerId,
          isProvisioned: false,
          reminderTimes: {
            todoReminder: '09:15',
            eodReminder: '18:00',
            defaulterCheck: {
              todo: '10:00',
              eod: '19:00',
            },
          },
          penaltyConfig: {
            todoDefault: 1,
            eodDefault: 1,
            attendanceDefault: 2,
          },
          leaveQuotas: {
            sick: 12,
            casual: 12,
            earned: 15,
            unpaid: 0,
          },
        },
      });

      this.logger.log(`Created guild record for ${guildId} (${discordGuild.name})`);
    } catch (error) {
      // If it's already a PraXio error, rethrow it
      if (error instanceof NotFoundError) {
        throw error;
      }
      // Log and wrap other errors
      this.logger.error(`Failed to ensure guild exists: ${guildId}`, error);
      throw new NotFoundError('Guild');
    }
  }

  /**
   * Apply for leave
   */
  async applyForLeave(
    guildId: string,
    userId: string,
    leaveType: LeaveType,
    startDate: string,
    endDate: string,
    reason: string,
  ): Promise<{ applicationId: string; status: string }> {
    // Ensure guild exists before processing leave
    await this.ensureGuildExists(guildId);

    // Parse and validate dates
    let start: Date;
    let end: Date;
    try {
      start = parseISTDate(startDate);
      end = parseISTDate(endDate);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Invalid date format')) {
        throw new ConflictError(error.message);
      }
      throw new ConflictError('Invalid date format. Please use YYYY-MM-DD format (e.g., 2026-01-25).');
    }

    // Validate dates
    if (isPastIST(start)) {
      throw new ConflictError('Start date cannot be in the past');
    }

    if (end < start) {
      throw new ConflictError('End date must be after start date');
    }

    // Check leave balance
    const balance = await this.getLeaveBalance(guildId, userId, leaveType);
    const daysRequested = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    if (leaveType !== LeaveType.UNPAID_LEAVE && balance < daysRequested) {
      throw new ConflictError(
        `Insufficient leave balance. Available: ${balance} days, Requested: ${daysRequested} days`,
      );
    }

    // Create leave application
    const leave = await this.prisma.leave.create({
      data: {
        guildId,
        userId,
        leaveType,
        startDate: start,
        endDate: end,
        reason,
        status: LeaveStatus.PENDING,
      },
    });

    this.logger.log(
      `Leave application created: ${leave.applicationId} by user ${userId} in guild ${guildId}`,
    );

    return {
      applicationId: leave.applicationId,
      status: leave.status,
    };
  }

  /**
   * Approve leave application
   */
  async approveLeave(
    guildId: string,
    applicationId: string,
    approvedBy: string,
  ): Promise<{ applicationId: string; status: string }> {
    const leave = await this.prisma.leave.findUnique({
      where: { applicationId },
    });

    if (!leave) {
      throw new NotFoundError('Leave application');
    }

    if (leave.guildId !== guildId) {
      throw new PermissionError('Leave application does not belong to this guild');
    }

    if (leave.status !== LeaveStatus.PENDING) {
      throw new ConflictError(`Leave application is already ${leave.status}`);
    }

    // Deduct leave balance if not unpaid
    if (leave.leaveType !== LeaveType.UNPAID_LEAVE) {
      // Balance deduction is handled by business logic
      // In a real system, you'd update a separate leave balance table
    }

    const updated = await this.prisma.leave.update({
      where: { applicationId },
      data: {
        status: LeaveStatus.APPROVED,
        approvedBy,
        approvedAt: new Date(),
      },
    });

    this.logger.log(`Leave application ${applicationId} approved by ${approvedBy}`);

    return {
      applicationId: updated.applicationId,
      status: updated.status,
    };
  }

  /**
   * Reject leave application
   */
  async rejectLeave(
    guildId: string,
    applicationId: string,
    rejectedBy: string,
    reason: string,
  ): Promise<{ applicationId: string; status: string }> {
    const leave = await this.prisma.leave.findUnique({
      where: { applicationId },
    });

    if (!leave) {
      throw new NotFoundError('Leave application');
    }

    if (leave.guildId !== guildId) {
      throw new PermissionError('Leave application does not belong to this guild');
    }

    if (leave.status !== LeaveStatus.PENDING) {
      throw new ConflictError(`Leave application is already ${leave.status}`);
    }

    const updated = await this.prisma.leave.update({
      where: { applicationId },
      data: {
        status: LeaveStatus.REJECTED,
        approvedBy: rejectedBy,
        approvedAt: new Date(),
        rejectionReason: reason,
      },
    });

    this.logger.log(`Leave application ${applicationId} rejected by ${rejectedBy}`);

    return {
      applicationId: updated.applicationId,
      status: updated.status,
    };
  }

  /**
   * Get leave balance for a user
   */
  async getLeaveBalance(
    guildId: string,
    userId: string,
    leaveType: LeaveType,
  ): Promise<number> {
    // Ensure guild exists
    await this.ensureGuildExists(guildId);

    // Get guild leave quotas
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
    });

    if (!guild) {
      throw new NotFoundError('Guild');
    }

    const quotas = (guild.leaveQuotas as any) || {
      sick: 12,
      casual: 12,
      earned: 15,
      unpaid: 0,
    };

    // Get quota for leave type
    let quota = 0;
    switch (leaveType) {
      case LeaveType.SICK_LEAVE:
        quota = quotas.sick || 12;
        break;
      case LeaveType.CASUAL_LEAVE:
        quota = quotas.casual || 12;
        break;
      case LeaveType.EARNED_LEAVE:
        quota = quotas.earned || 15;
        break;
      case LeaveType.UNPAID_LEAVE:
        return Infinity; // Unlimited unpaid leave
    }

    // Calculate used leaves (approved leaves of this type in current year)
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31);

    const approvedLeaves = await this.prisma.leave.findMany({
      where: {
        guildId,
        userId,
        leaveType,
        status: LeaveStatus.APPROVED,
        startDate: { gte: startOfYear, lte: endOfYear },
      },
    });

    // Calculate total days used
    let usedDays = 0;
    for (const leave of approvedLeaves) {
      const days = Math.ceil(
        (leave.endDate.getTime() - leave.startDate.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1;
      usedDays += days;
    }

    return Math.max(0, quota - usedDays);
  }

  /**
   * Get leave applications with filters
   */
  async getLeaves(
    guildId: string,
    filters?: {
      userId?: string;
      status?: LeaveStatus;
      startDate?: Date;
      endDate?: Date;
    },
  ) {
    const where: any = { guildId };

    if (filters?.userId) where.userId = filters.userId;
    if (filters?.status) where.status = filters.status;
    if (filters?.startDate || filters?.endDate) {
      where.OR = [];
      if (filters.startDate) {
        where.OR.push({ startDate: { gte: filters.startDate } });
      }
      if (filters.endDate) {
        where.OR.push({ endDate: { lte: filters.endDate } });
      }
    }

    return this.prisma.leave.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get pending leave applications
   */
  async getPendingLeaves(guildId: string) {
    return this.getLeaves(guildId, { status: LeaveStatus.PENDING });
  }

  /**
   * Get leave calendar for a date range
   */
  async getLeaveCalendar(
    guildId: string,
    startDate: Date,
    endDate: Date,
    userId?: string,
  ): Promise<{
    leaves: Array<{
      id: string;
      userId: string;
      username: string;
      leaveType: string;
      startDate: Date;
      endDate: Date;
      status: string;
      days: number;
    }>;
    conflicts: Array<{
      date: Date;
      users: Array<{ userId: string; username: string }>;
      count: number;
    }>;
  }> {
    const leaves = await this.getLeaves(guildId, {
      startDate,
      endDate,
      userId,
    });

    // Filter only approved leaves for calendar
    const approvedLeaves = leaves.filter((leave) => leave.status === LeaveStatus.APPROVED);

    // Format leaves for calendar
    const formattedLeaves = approvedLeaves.map((leave) => {
      const days = Math.ceil(
        (leave.endDate.getTime() - leave.startDate.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1;
      return {
        id: leave.id,
        userId: leave.userId,
        username: leave.user.username,
        leaveType: leave.leaveType,
        startDate: leave.startDate,
        endDate: leave.endDate,
        status: leave.status,
        days,
      };
    });

    // Detect conflicts (multiple people on leave on same day)
    const conflicts: Array<{
      date: Date;
      users: Array<{ userId: string; username: string }>;
      count: number;
    }> = [];

    const dateMap = new Map<string, Set<string>>();

    for (const leave of formattedLeaves) {
      const currentDate = new Date(leave.startDate);
      while (currentDate <= leave.endDate) {
        const dateKey = formatISTDate(currentDate);
        if (!dateMap.has(dateKey)) {
          dateMap.set(dateKey, new Set());
        }
        dateMap.get(dateKey)!.add(`${leave.userId}:${leave.username}`);
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    // Find dates with conflicts (more than 1 person on leave)
    for (const [dateKey, users] of dateMap.entries()) {
      if (users.size > 1) {
        const userArray = Array.from(users).map((userStr) => {
          const [userId, username] = userStr.split(':');
          return { userId, username };
        });
        conflicts.push({
          date: parseISTDate(dateKey),
          users: userArray,
          count: users.size,
        });
      }
    }

    return {
      leaves: formattedLeaves,
      conflicts: conflicts.sort((a, b) => a.date.getTime() - b.date.getTime()),
    };
  }

  /**
   * Get user leave history
   */
  async getUserLeaveHistory(guildId: string, userId: string) {
    return this.getLeaves(guildId, { userId });
  }

  /**
   * Get upcoming leaves (within next N days)
   */
  async getUpcomingLeaves(guildId: string, days: number = 30) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + days);

    return this.getLeaves(guildId, {
      status: LeaveStatus.APPROVED,
      startDate: today,
      endDate: futureDate,
    });
  }

  /**
   * Check for team capacity conflicts
   */
  async checkTeamCapacity(
    guildId: string,
    startDate: Date,
    endDate: Date,
    maxCapacity?: number,
  ): Promise<{
    hasConflict: boolean;
    conflictDays: Array<{
      date: Date;
      onLeave: number;
      capacity: number;
    }>;
  }> {
    const calendar = await this.getLeaveCalendar(guildId, startDate, endDate);

    // Get total active users in guild
    const totalUsers = await this.prisma.user.count({
      where: {
        guildId,
        isActive: true,
      },
    });

    // Default max capacity is 50% of team
    const capacity = maxCapacity || Math.ceil(totalUsers * 0.5);

    const conflictDays: Array<{
      date: Date;
      onLeave: number;
      capacity: number;
    }> = [];

    const dateMap = new Map<string, number>();

    // Count people on leave per day
    for (const leave of calendar.leaves) {
      const currentDate = new Date(leave.startDate);
      while (currentDate <= leave.endDate) {
        const dateKey = formatISTDate(currentDate);
        dateMap.set(dateKey, (dateMap.get(dateKey) || 0) + 1);
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    // Find days exceeding capacity
    for (const [dateKey, onLeave] of dateMap.entries()) {
      if (onLeave > capacity) {
        conflictDays.push({
          date: parseISTDate(dateKey),
          onLeave,
          capacity,
        });
      }
    }

    return {
      hasConflict: conflictDays.length > 0,
      conflictDays: conflictDays.sort((a, b) => a.date.getTime() - b.date.getTime()),
    };
  }
}
