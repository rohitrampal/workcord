import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@infra/database/prisma.service';
import { DiscordService } from '@infra/discord/discord.service';
import { ConflictError, NotFoundError } from '@shared/utils/errors';
import { getCurrentISTDate, formatISTDate, isTodayIST, calculateHours } from '@shared/utils/date';
import { AttendanceLocation } from '@shared/types';

/**
 * Attendance Service
 * Handles check-in, check-out, and attendance tracking
 */
@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

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
   * Ensure user exists in database, create if it doesn't
   */
  private async ensureUserExists(guildId: string, userId: string): Promise<void> {
    try {
      const existingUser = await this.prisma.user.findUnique({
        where: {
          guildId_id: {
            guildId,
            id: userId,
          },
        },
      });

      if (existingUser) {
        return;
      }

      // Fetch user from Discord
      const discordUser = await this.discord.getUser(userId);
      if (!discordUser) {
        throw new NotFoundError('User not found in Discord');
      }

      // Fetch guild member to get username in guild context
      const guildMember = await this.discord.getGuildMember(guildId, userId);

      // Create minimal user record
      await this.prisma.user.create({
        data: {
          id: userId,
          guildId,
          username: guildMember?.displayName || discordUser.username,
          discriminator: discordUser.discriminator !== '0' ? discordUser.discriminator : null,
          isActive: true,
        },
      });

      this.logger.log(`Created user record for ${userId} in guild ${guildId}`);
    } catch (error) {
      // If it's already a PraXio error, rethrow it
      if (error instanceof NotFoundError) {
        throw error;
      }
      // Log and wrap other errors
      this.logger.error(`Failed to ensure user exists: ${userId} in guild ${guildId}`, error);
      throw new NotFoundError('User');
    }
  }

  /**
   * Check in for the day
   */
  async checkIn(
    guildId: string,
    userId: string,
    location: AttendanceLocation,
  ): Promise<{ id: string; checkInAt: Date; location: string }> {
    // Ensure guild and user exist before creating attendance
    await this.ensureGuildExists(guildId);
    await this.ensureUserExists(guildId, userId);

    const today = getCurrentISTDate();
    const dateStr = formatISTDate(today);

    // Check if already checked in today
    const existing = await this.prisma.attendance.findUnique({
      where: {
        guildId_userId_date: {
          guildId,
          userId,
          date: new Date(dateStr),
        },
      },
    });

    if (existing && existing.checkInAt) {
      throw new ConflictError('You have already checked in today');
    }

    const attendance = await this.prisma.attendance.upsert({
      where: {
        guildId_userId_date: {
          guildId,
          userId,
          date: new Date(dateStr),
        },
      },
      create: {
        guildId,
        userId,
        checkInAt: getCurrentISTDate(),
        location,
        date: new Date(dateStr),
      },
      update: {
        checkInAt: getCurrentISTDate(),
        location,
      },
    });

    this.logger.log(`User ${userId} checked in at ${location} in guild ${guildId}`);

    return {
      id: attendance.id,
      checkInAt: attendance.checkInAt,
      location: attendance.location,
    };
  }

  /**
   * Check out for the day
   */
  async checkOut(guildId: string, userId: string): Promise<{ id: string; hoursWorked: number }> {
    // Ensure guild and user exist
    await this.ensureGuildExists(guildId);
    await this.ensureUserExists(guildId, userId);

    const today = getCurrentISTDate();
    const dateStr = formatISTDate(today);

    const attendance = await this.prisma.attendance.findUnique({
      where: {
        guildId_userId_date: {
          guildId,
          userId,
          date: new Date(dateStr),
        },
      },
    });

    if (!attendance) {
      throw new NotFoundError('You must check in before checking out. Please use /checkin first.');
    }

    if (attendance.checkOutAt) {
      throw new ConflictError('You have already checked out today');
    }

    const checkOutAt = getCurrentISTDate();
    const hoursWorked = calculateHours(attendance.checkInAt, checkOutAt);

    // Validate work hours (minimum 4, maximum 16)
    if (hoursWorked < 4) {
      throw new ConflictError('Minimum work hours (4) not met');
    }
    if (hoursWorked > 16) {
      throw new ConflictError('Maximum work hours (16) exceeded');
    }

    const updated = await this.prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        checkOutAt,
        hoursWorked,
      },
    });

    this.logger.log(
      `User ${userId} checked out with ${hoursWorked.toFixed(2)} hours in guild ${guildId}`,
    );

    return {
      id: updated.id,
      hoursWorked: updated.hoursWorked!,
    };
  }

  /**
   * Get attendance for a date range
   */
  async getAttendance(
    guildId: string,
    userId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<any[]> {
    const where: any = { guildId };

    if (userId) where.userId = userId;

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = startDate;
      if (endDate) where.date.lte = endDate;
    }

    return this.prisma.attendance.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
      orderBy: { date: 'desc' },
    });
  }

  /**
   * Calculate attendance percentage for a month
   */
  async getAttendancePercentage(
    guildId: string,
    userId: string,
    year: number,
    month: number,
  ): Promise<number> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const attendance = await this.getAttendance(guildId, userId, startDate, endDate);
    const totalDays = endDate.getDate();
    const presentDays = attendance.filter((a) => a.checkInAt && a.checkOutAt).length;

    return totalDays > 0 ? (presentDays / totalDays) * 100 : 0;
  }

  /**
   * Get today's attendance status
   */
  async getTodayAttendance(guildId: string, userId: string) {
    const today = getCurrentISTDate();
    const dateStr = formatISTDate(today);

    return this.prisma.attendance.findUnique({
      where: {
        guildId_userId_date: {
          guildId,
          userId,
          date: new Date(dateStr),
        },
      },
    });
  }
}
