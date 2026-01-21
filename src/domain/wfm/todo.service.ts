import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@infra/database/prisma.service';
import { ConflictError } from '@shared/utils/errors';
import { getCurrentISTDate, formatISTDate } from '@shared/utils/date';

/**
 * To-Do Service
 * Handles to-do list tracking and defaulter detection
 */
@Injectable()
export class TodoService {
  private readonly logger = new Logger(TodoService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Create or update to-do entry
   */
  async createTodo(
    guildId: string,
    userId: string,
    channelId: string,
    content: string,
  ): Promise<{ id: string; date: Date }> {
    const today = getCurrentISTDate();
    const dateStr = formatISTDate(today);

    const todo = await this.prisma.todo.upsert({
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
        content,
        date: new Date(dateStr),
      },
      update: {
        content,
        postedAt: new Date(),
      },
    });

    this.logger.log(`To-Do created/updated for user ${userId} in channel ${channelId}`);

    return {
      id: todo.id,
      date: todo.date,
    };
  }

  /**
   * Get to-do entries for a date range
   */
  async getTodos(
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

    return this.prisma.todo.findMany({
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
    // Get all users in the channel (from Discord)
    // For now, we'll get users who should have posted but didn't
    const todos = await this.prisma.todo.findMany({
      where: {
        guildId,
        channelId,
        date,
      },
      select: {
        userId: true,
      },
    });

    const postedUserIds = new Set(todos.map((t) => t.userId));

    // Get all active users in the guild
    const allUsers = await this.prisma.user.findMany({
      where: {
        guildId,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    // Find users who didn't post
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
    const todos = await this.getTodos(guildId, channelId, undefined, startDate, endDate);
    const uniqueUsers = new Set(todos.map((t) => t.userId));

    // Get total active users (simplified - in production, get from channel members)
    const totalUsers = await this.prisma.user.count({
      where: {
        guildId,
        isActive: true,
      },
    });

    if (totalUsers === 0) return 0;

    // Calculate days in range
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const expectedPosts = totalUsers * days;
    const actualPosts = todos.length;

    return expectedPosts > 0 ? (actualPosts / expectedPosts) * 100 : 0;
  }
}
