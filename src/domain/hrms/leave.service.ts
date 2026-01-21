import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@infra/database/prisma.service';
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

  constructor(private prisma: PrismaService) {}

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
    const start = parseISTDate(startDate);
    const end = parseISTDate(endDate);

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
}
