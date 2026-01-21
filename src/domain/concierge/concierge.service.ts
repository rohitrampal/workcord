import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@infra/database/prisma.service';
import { DiscordService } from '@infra/discord/discord.service';
import { ChannelType } from 'discord.js';
import { NotFoundError } from '@shared/utils/errors';
import { getCurrentISTDate } from '@shared/utils/date';

/**
 * Concierge Service
 * Handles private channel creation and personal statistics
 */
@Injectable()
export class ConciergeService {
  private readonly logger = new Logger(ConciergeService.name);

  constructor(
    private prisma: PrismaService,
    private discord: DiscordService,
  ) {}

  /**
   * Create concierge channel for a user
   */
  async createConciergeChannel(guildId: string, userId: string): Promise<string> {
    // Check if channel already exists
    const existing = await this.prisma.conciergeChannel.findUnique({
      where: { userId },
    });

    if (existing) {
      return existing.channelId;
    }

    const guild = await this.discord.getGuild(guildId);
    if (!guild) {
      throw new NotFoundError('Guild');
    }

    const user = await this.discord.getUser(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    // Create private channel
    const channel = await guild.channels.create({
      name: `concierge-${user.username}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: ['ViewChannel'],
        },
        {
          id: userId,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
        },
      ],
    });

    // Save to database
    await this.prisma.conciergeChannel.create({
      data: {
        guildId,
        userId,
        channelId: channel.id,
      },
    });

    // Send welcome message
    await channel.send({
      embeds: [
        {
          title: '👋 Welcome to Your Concierge Channel!',
          description: 'This is your private channel for personal assistance and information.',
          color: 0x0099ff,
          fields: [
            {
              name: 'Available Commands',
              value: '• `/mystats` - View your personal statistics\n• `/hrhelp` - Get HR assistance\n• `/knowledgebase` - Access company documentation',
              inline: false,
            },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    });

    this.logger.log(`Concierge channel created for user ${userId} in guild ${guildId}`);

    return channel.id;
  }

  /**
   * Get personal statistics for a user
   */
  async getPersonalStats(guildId: string, userId: string) {
    const now = getCurrentISTDate();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Get attendance percentage
    const attendanceRecords = await this.prisma.attendance.findMany({
      where: {
        guildId,
        userId,
        date: {
          gte: new Date(currentYear, currentMonth - 1, 1),
          lte: new Date(currentYear, currentMonth, 0),
        },
      },
    });

    const totalDays = new Date(currentYear, currentMonth, 0).getDate();
    const presentDays = attendanceRecords.filter((a) => a.checkInAt && a.checkOutAt).length;
    const attendancePercentage = totalDays > 0 ? (presentDays / totalDays) * 100 : 0;

    // Get leave counts
    const [pendingLeaves, approvedLeaves] = await Promise.all([
      this.prisma.leave.count({
        where: {
          guildId,
          userId,
          status: 'Pending',
        },
      }),
      this.prisma.leave.count({
        where: {
          guildId,
          userId,
          status: 'Approved',
        },
      }),
    ]);

    // Get task counts
    const [totalTasks, inProgressTasks, completedTasks] = await Promise.all([
      this.prisma.task.count({
        where: {
          guildId,
          assigneeId: userId,
        },
      }),
      this.prisma.task.count({
        where: {
          guildId,
          assigneeId: userId,
          status: 'In Progress',
        },
      }),
      this.prisma.task.count({
        where: {
          guildId,
          assigneeId: userId,
          status: 'Completed',
        },
      }),
    ]);

    // Get to-do and update compliance (simplified)
    const thisMonth = new Date(currentYear, currentMonth - 1, 1);
    const endOfMonth = new Date(currentYear, currentMonth, 0);

    const [todos, updates] = await Promise.all([
      this.prisma.todo.count({
        where: {
          guildId,
          userId,
          date: {
            gte: thisMonth,
            lte: endOfMonth,
          },
        },
      }),
      this.prisma.update.count({
        where: {
          guildId,
          userId,
          date: {
            gte: thisMonth,
            lte: endOfMonth,
          },
        },
      }),
    ]);

    const todoCompliance = totalDays > 0 ? (todos / totalDays) * 100 : 0;
    const updateCompliance = totalDays > 0 ? (updates / totalDays) * 100 : 0;

    return {
      attendance: {
        percentage: Math.round(attendancePercentage * 100) / 100,
        presentDays,
        totalDays,
      },
      leaves: {
        pending: pendingLeaves,
        approved: approvedLeaves,
      },
      tasks: {
        total: totalTasks,
        inProgress: inProgressTasks,
        completed: completedTasks,
      },
      compliance: {
        todo: Math.round(todoCompliance * 100) / 100,
        update: Math.round(updateCompliance * 100) / 100,
      },
    };
  }
}
