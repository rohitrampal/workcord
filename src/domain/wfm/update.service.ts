import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@infra/database/prisma.service';
import { getCurrentISTDate, formatISTDate } from '@shared/utils/date';

/**
 * EOD Update Service
 * Handles end-of-day update tracking and defaulter detection
 */
@Injectable()
export class UpdateService {
  private readonly logger = new Logger(UpdateService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Create or update EOD update entry
   */
  async createUpdate(
    guildId: string,
    userId: string,
    channelId: string,
    completed?: string,
    inProgress?: string,
    blockers?: string,
  ): Promise<{ id: string; date: Date }> {
    const today = getCurrentISTDate();
    const dateStr = formatISTDate(today);

    const update = await this.prisma.update.upsert({
      where: {
        guildId_userId_channelId_date: {
          guildId,
          userId,
          channelId,
          date: new Date(dateStr),
        },
      },
      create: {
        guildId,
        userId,
        channelId,
        completed: completed || null,
        inProgress: inProgress || null,
        blockers: blockers || null,
        date: new Date(dateStr),
      },
      update: {
        completed: completed || null,
        inProgress: inProgress || null,
        blockers: blockers || null,
        postedAt: new Date(),
      },
    });

    this.logger.log(`EOD update created/updated for user ${userId} in channel ${channelId}`);

    return {
      id: update.id,
      date: update.date,
    };
  }

  /**
   * Get update entries for a date range
   */
  async getUpdates(
    guildId: string,
    channelId?: string,
    userId?: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    const where: any = { guildId };

    if (channelId) where.channelId = channelId;
    if (userId) where.userId = userId;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = startDate;
      if (endDate) where.date.lte = endDate;
    }

    return this.prisma.update.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
        channel: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { date: 'desc' },
    });
  }

  /**
   * Get defaulters for a channel on a specific date
   */
  async getDefaulters(guildId: string, channelId: string, date: Date): Promise<string[]> {
    const updates = await this.prisma.update.findMany({
      where: {
        guildId,
        channelId,
        date,
      },
      select: {
        userId: true,
      },
    });

    const postedUserIds = new Set(updates.map((u) => u.userId));

    const allUsers = await this.prisma.user.findMany({
      where: {
        guildId,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    const defaulters = allUsers
      .filter((u) => !postedUserIds.has(u.id))
      .map((u) => u.id);

    return defaulters;
  }

  /**
   * Calculate compliance rate for a channel
   */
  async getComplianceRate(
    guildId: string,
    channelId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const updates = await this.getUpdates(guildId, channelId, undefined, startDate, endDate);
    const uniqueUsers = new Set(updates.map((u) => u.userId));

    const totalUsers = await this.prisma.user.count({
      where: {
        guildId,
        isActive: true,
      },
    });

    if (totalUsers === 0) return 0;

    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const expectedPosts = totalUsers * days;
    const actualPosts = updates.length;

    return expectedPosts > 0 ? (actualPosts / expectedPosts) * 100 : 0;
  }
}
