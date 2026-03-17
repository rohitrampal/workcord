import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@infra/database/prisma.service';
import { DiscordService } from '@infra/discord/discord.service';
import { TodoService } from '@domain/wfm/todo.service';
import { UpdateService } from '@domain/wfm/update.service';
import { AuditService } from '@domain/audit/audit.service';
import { parseISTTime, getCurrentISTDate, formatISTDate } from '@shared/utils/date';
import { EmbedBuilder } from '@discordjs/builders';
import { PenaltyConfig } from '@shared/types';

/**
 * Reminder Service
 * Handles automated reminders for To-Do and EOD updates
 */
@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);

  constructor(
    private prisma: PrismaService,
    private discord: DiscordService,
    private todoService: TodoService,
    private updateService: UpdateService,
    private auditService: AuditService,
  ) {}

  /**
   * Send morning To-Do reminder
   */
  async sendTodoReminder(guildId: string): Promise<void> {
    try {
      const guild = await this.discord.getGuild(guildId);
      if (!guild) return;

      const channels = await this.prisma.channel.findMany({
        where: {
          guildId,
          isWfmEnabled: true,
        },
      });

      for (const channel of channels) {
        const textChannel = await this.discord.getTextChannel(channel.id);
        if (!textChannel) continue;

        const embed = new EmbedBuilder()
          .setTitle('📝 Morning To-Do Reminder')
          .setDescription('Please post your to-do list for today in this channel.')
          .setColor(0x0099ff)
          .addFields({
            name: 'Format',
            value: 'Simply type your tasks for today in a message below.',
            inline: false,
          })
          .setTimestamp();

        await textChannel.send({ embeds: [embed] });
        this.logger.log(`Sent To-Do reminder to channel ${channel.name} in guild ${guildId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to send To-Do reminder for guild ${guildId}`, error);
    }
  }

  /**
   * Send evening EOD reminder
   */
  async sendEodReminder(guildId: string): Promise<void> {
    try {
      const guild = await this.discord.getGuild(guildId);
      if (!guild) return;

      const channels = await this.prisma.channel.findMany({
        where: {
          guildId,
          isWfmEnabled: true,
        },
      });

      for (const channel of channels) {
        const textChannel = await this.discord.getTextChannel(channel.id);
        if (!textChannel) continue;

        const embed = new EmbedBuilder()
          .setTitle('🌅 End of Day Update Reminder')
          .setDescription('Please post your EOD update in this channel.')
          .setColor(0xff9900)
          .addFields(
            {
              name: 'Format',
              value: '**Completed:**\n- Task 1\n- Task 2\n\n**In Progress:**\n- Task 3\n\n**Blockers:**\n- Issue description',
              inline: false,
            },
          )
          .setTimestamp();

        await textChannel.send({ embeds: [embed] });
        this.logger.log(`Sent EOD reminder to channel ${channel.name} in guild ${guildId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to send EOD reminder for guild ${guildId}`, error);
    }
  }

  /**
   * Check for defaulters and send alerts
   */
  async checkDefaulters(guildId: string, type: 'todo' | 'eod'): Promise<void> {
    try {
      const guild = await this.discord.getGuild(guildId);
      if (!guild) return;

      const channels = await this.prisma.channel.findMany({
        where: {
          guildId,
          isWfmEnabled: true,
        },
      });

      const today = getCurrentISTDate();
      const dateStr = formatISTDate(today);

      for (const channel of channels) {
        const defaulters =
          type === 'todo'
            ? await this.todoService.getDefaulters(guildId, channel.id, new Date(dateStr))
            : await this.updateService.getDefaulters(guildId, channel.id, new Date(dateStr));

        if (defaulters.length === 0) continue;

        // Get admin channel
        const adminChannel = await this.prisma.channel.findFirst({
          where: {
            guildId,
            type: 'admin',
          },
        });

        if (adminChannel) {
          const textChannel = await this.discord.getTextChannel(adminChannel.id);
          if (textChannel) {
            const mentions = defaulters.map((id) => `<@${id}>`).join(', ');
            const embed = new EmbedBuilder()
              .setTitle(`⚠️ ${type.toUpperCase()} Defaulters`)
              .setDescription(
                `The following users have not posted their ${type === 'todo' ? 'To-Do' : 'EOD update'} today:`,
              )
              .setColor(0xff0000)
              .addFields({
                name: 'Defaulters',
                value: mentions || 'None',
                inline: false,
              })
              .setTimestamp();

            await textChannel.send({ embeds: [embed] });

            // Send DM to defaulters and assign penalties
            const guild = await this.prisma.guild.findUnique({
              where: { id: guildId },
            });

            const penaltyConfig: PenaltyConfig = (guild?.penaltyConfig as unknown as PenaltyConfig) || {
              todoDefault: 1,
              eodDefault: 1,
              attendanceDefault: 2,
            };

            const penaltyPoints = type === 'todo' ? penaltyConfig.todoDefault : penaltyConfig.eodDefault;

            for (const defaulterId of defaulters) {
              // Send DM
              await this.discord.sendDM(
                defaulterId,
                `⚠️ Reminder: You haven't posted your ${type === 'todo' ? 'To-Do list' : 'EOD update'} today. Please do so as soon as possible.`,
              );

              // Assign penalty
              try {
                const user = await this.prisma.user.findUnique({
                  where: { guildId_id: { guildId, id: defaulterId } },
                });

                if (user) {
                  const newPenaltyPoints = (user.penaltyPoints || 0) + penaltyPoints;

                  await this.prisma.user.update({
                    where: { guildId_id: { guildId, id: defaulterId } },
                    data: { penaltyPoints: newPenaltyPoints },
                  });

                  // Log penalty assignment
                  await this.auditService.logAction(
                    guildId,
                    'system',
                    'penalty_assign',
                    'user',
                    defaulterId,
                    {
                      type,
                      points: penaltyPoints,
                      totalPoints: newPenaltyPoints,
                      channelId: channel.id,
                      date: dateStr,
                    },
                  );

                  // Check for threshold warnings (5, 10, 15 points)
                  if (newPenaltyPoints >= 5 && newPenaltyPoints < 10) {
                    await this.discord.sendDM(
                      defaulterId,
                      `⚠️ Warning: You have accumulated ${newPenaltyPoints} penalty points. Please ensure compliance with WFM requirements.`,
                    );
                  } else if (newPenaltyPoints >= 10 && newPenaltyPoints < 15) {
                    await this.discord.sendDM(
                      defaulterId,
                      `🔴 Critical Warning: You have accumulated ${newPenaltyPoints} penalty points. Immediate action required.`,
                    );
                  } else if (newPenaltyPoints >= 15) {
                    await this.discord.sendDM(
                      defaulterId,
                      `🚨 Escalation: You have accumulated ${newPenaltyPoints} penalty points. Please contact your manager immediately.`,
                    );
                  }

                  this.logger.log(
                    `Assigned ${penaltyPoints} penalty points to user ${defaulterId} (total: ${newPenaltyPoints})`,
                  );
                }
              } catch (penaltyError) {
                this.logger.error(`Failed to assign penalty to user ${defaulterId}`, penaltyError);
              }
            }
          }
        }

        this.logger.log(
          `Found ${defaulters.length} ${type} defaulters in channel ${channel.name} for guild ${guildId}`,
        );
      }
    } catch (error) {
      this.logger.error(`Failed to check defaulters for guild ${guildId}`, error);
    }
  }
}
