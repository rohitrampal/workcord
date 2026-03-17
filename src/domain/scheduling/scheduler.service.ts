import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@infra/database/prisma.service';
import { ReminderService } from './reminder.service';
import { LeaveService } from '@domain/hrms/leave.service';
import { TaskService } from '@domain/tasks/task.service';
import { DiscordService } from '@infra/discord/discord.service';
import { parseISTTime, getCurrentISTDate, formatISTDate } from '@shared/utils/date';
import { EmbedBuilder } from '@discordjs/builders';
import { TaskStatus } from '@shared/types';

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
    private leaveService: LeaveService,
    private taskService: TaskService,
    private discord: DiscordService,
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

  /**
   * Check for upcoming leaves and send notifications
   * Runs daily at 9:00 AM IST
   */
  @Cron('0 9 * * *') // 9:00 AM every day
  async checkUpcomingLeaves() {
    try {
      const guilds = await this.prisma.guild.findMany({
        where: { isProvisioned: true },
      });

      for (const guild of guilds) {
        try {
          // Get leaves starting in next 3 days
          const upcomingLeaves = await this.leaveService.getUpcomingLeaves(guild.id, 3);

          if (upcomingLeaves.length === 0) continue;

          // Get admin channel
          const adminChannel = await this.prisma.channel.findFirst({
            where: {
              guildId: guild.id,
              type: 'admin',
            },
          });

          if (!adminChannel) continue;

          const textChannel = await this.discord.getTextChannel(adminChannel.id);
          if (!textChannel) continue;

          // Group leaves by start date
          const leavesByDate = new Map<string, typeof upcomingLeaves>();
          for (const leave of upcomingLeaves) {
            const dateKey = formatISTDate(leave.startDate);
            if (!leavesByDate.has(dateKey)) {
              leavesByDate.set(dateKey, []);
            }
            leavesByDate.get(dateKey)!.push(leave);
          }

          // Create embed with upcoming leaves
          const embed = new EmbedBuilder()
            .setTitle('📅 Upcoming Leaves (Next 3 Days)')
            .setColor(0xff9900)
            .setTimestamp();

          for (const [dateKey, leaves] of leavesByDate.entries()) {
            const leaveList = leaves
              .map((l) => `• <@${l.userId}> - ${l.leaveType} (${formatISTDate(l.startDate)} to ${formatISTDate(l.endDate)})`)
              .join('\n');
            embed.addFields({
              name: dateKey,
              value: leaveList || 'No leaves',
              inline: false,
            });
          }

          await textChannel.send({ embeds: [embed] });
          this.logger.log(`Sent upcoming leave notifications for guild ${guild.id}`);
        } catch (error) {
          this.logger.error(`Failed to check upcoming leaves for guild ${guild.id}`, error);
        }
      }
    } catch (error) {
      this.logger.error('Error in upcoming leaves check', error);
    }
  }

  /**
   * Check for overdue tasks and send notifications
   * Runs daily at 10:00 AM IST
   */
  @Cron('0 10 * * *') // 10:00 AM every day
  async checkOverdueTasks() {
    try {
      const guilds = await this.prisma.guild.findMany({
        where: { isProvisioned: true },
      });

      for (const guild of guilds) {
        try {
          // Get overdue tasks
          const overdueTasks = await this.taskService.getOverdueTasks(guild.id);

          if (overdueTasks.length === 0) continue;

          // Get admin channel
          const adminChannel = await this.prisma.channel.findFirst({
            where: {
              guildId: guild.id,
              type: 'admin',
            },
          });

          if (!adminChannel) continue;

          const textChannel = await this.discord.getTextChannel(adminChannel.id);
          if (!textChannel) continue;

          // Group tasks by assignee
          const tasksByAssignee = new Map<string, typeof overdueTasks>();
          for (const task of overdueTasks) {
            const assigneeId = task.assigneeId;
            if (!tasksByAssignee.has(assigneeId)) {
              tasksByAssignee.set(assigneeId, []);
            }
            tasksByAssignee.get(assigneeId)!.push(task);
          }

          // Send DM to each assignee with their overdue tasks
          for (const [assigneeId, tasks] of tasksByAssignee.entries()) {
            try {
              const taskList = tasks
                .map((t) => {
                  const dueDate = t.dueDate ? formatISTDate(t.dueDate) : 'No due date';
                  const priority = t.priority || 'Normal';
                  return `• **${t.title}** (Due: ${dueDate}, Priority: ${priority})`;
                })
                .join('\n');

              const dmEmbed = new EmbedBuilder()
                .setTitle('⚠️ Overdue Tasks Reminder')
                .setDescription(`You have ${tasks.length} overdue task(s):`)
                .addFields({
                  name: 'Tasks',
                  value: taskList.length > 1000 ? taskList.substring(0, 1000) + '...' : taskList,
                  inline: false,
                })
                .setColor(0xff0000)
                .setFooter({ text: 'Please update the status of these tasks or contact your manager.' })
                .setTimestamp();

              // Send DM with embed
              const user = await this.discord.getUser(assigneeId);
              if (user) {
                await user.send({ embeds: [dmEmbed] });
                this.logger.log(`Sent overdue task notification to user ${assigneeId} for ${tasks.length} tasks`);
              }
            } catch (error) {
              this.logger.error(`Failed to send DM to user ${assigneeId}`, error);
            }
          }

          // Send summary to admin channel
          const totalOverdue = overdueTasks.length;
          const uniqueAssignees = tasksByAssignee.size;

          const adminEmbed = new EmbedBuilder()
            .setTitle('📋 Overdue Tasks Summary')
            .setDescription(`Found ${totalOverdue} overdue task(s) assigned to ${uniqueAssignees} user(s)`)
            .setColor(0xff9900)
            .setTimestamp();

          // Add summary by assignee
          for (const [assigneeId, tasks] of tasksByAssignee.entries()) {
            const assigneeName = tasks[0].assignee?.username || `<@${assigneeId}>`;
            adminEmbed.addFields({
              name: assigneeName,
              value: `${tasks.length} overdue task(s)`,
              inline: true,
            });
          }

          await textChannel.send({ embeds: [adminEmbed] });
          this.logger.log(`Sent overdue task summary to admin channel for guild ${guild.id}`);
        } catch (error) {
          this.logger.error(`Failed to check overdue tasks for guild ${guild.id}`, error);
        }
      }
    } catch (error) {
      this.logger.error('Error in overdue tasks check', error);
    }
  }
}
