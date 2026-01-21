import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@infra/database/prisma.service';
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

  constructor(private prisma: PrismaService) {}

  /**
   * Check in for the day
   */
  async checkIn(
    guildId: string,
    userId: string,
    location: AttendanceLocation,
  ): Promise<{ id: string; checkInAt: Date; location: string }> {
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
      throw new NotFoundError('Attendance record (check-in not found)');
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
