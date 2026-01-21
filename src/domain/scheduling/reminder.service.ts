import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@infra/database/prisma.service';
import { DiscordService } from '@infra/discord/discord.service';
import { TodoService } from '@domain/wfm/todo.service';
import { UpdateService } from '@domain/wfm/update.service';
import { parseISTTime, getCurrentISTDate, formatISTDate } from '@shared/utils/date';
import { EmbedBuilder } from '@discordjs/builders';

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

            // Send DM to defaulters
            for (const defaulterId of defaulters) {
              await this.discord.sendDM(
                defaulterId,
                `⚠️ Reminder: You haven't posted your ${type === 'todo' ? 'To-Do list' : 'EOD update'} today. Please do so as soon as possible.`,
              );
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
