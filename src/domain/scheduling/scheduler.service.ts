import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@infra/database/prisma.service';
import { ReminderService } from './reminder.service';
import { parseISTTime } from '@shared/utils/date';

/**
 * Scheduler Service
 * Handles scheduled tasks using NestJS Schedule module
 * Note: In production, use Bull queues with Redis for better scalability
 */
@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private reminderService: ReminderService,
  ) {}

  async onModuleInit() {
    this.logger.log('Scheduler service initialized');
  }

  /**
   * Run every minute to check for reminder times
   * In production, use Bull queues for better performance
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkReminders() {
    try {
      const guilds = await this.prisma.guild.findMany({
        where: { isProvisioned: true },
      });

      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

      for (const guild of guilds) {
        const reminderTimes = (guild.reminderTimes as any) || {
          todoReminder: '09:15',
          eodReminder: '18:00',
          defaulterCheck: {
            todo: '10:00',
            eod: '19:00',
          },
        };

        // Check To-Do reminder (9:15 AM IST)
        if (currentTime === reminderTimes.todoReminder) {
          await this.reminderService.sendTodoReminder(guild.id);
        }

        // Check EOD reminder (6:00 PM IST)
        if (currentTime === reminderTimes.eodReminder) {
          await this.reminderService.sendEodReminder(guild.id);
        }

        // Check To-Do defaulter check (10:00 AM IST)
        if (currentTime === reminderTimes.defaulterCheck?.todo) {
          await this.reminderService.checkDefaulters(guild.id, 'todo');
        }

        // Check EOD defaulter check (7:00 PM IST)
        if (currentTime === reminderTimes.defaulterCheck?.eod) {
          await this.reminderService.checkDefaulters(guild.id, 'eod');
        }
      }
    } catch (error) {
      this.logger.error('Error in scheduled reminder check', error);
    }
  }
}
