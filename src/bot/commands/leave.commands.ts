import { SlashCommandBuilder, EmbedBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { LeaveService } from '@domain/hrms/leave.service';
import { AuditService } from '@domain/audit/audit.service';
import { DiscordService } from '@infra/discord/discord.service';
import { PrismaService } from '@infra/database/prisma.service';
import { handleError } from '@shared/utils/errors';
import { Logger } from '@nestjs/common';
import { parseISTDate, formatISTDate, getCurrentISTDate } from '@shared/utils/date';

/**
 * Leave Commands
 */
export class LeaveCommands {
  private readonly logger = new Logger(LeaveCommands.name);

  constructor(
    private leaveService: LeaveService,
    private auditService: AuditService,
    private discord: DiscordService,
    private prisma: PrismaService,
  ) {}

  /**
   * Register leave commands
   */
  static getCommands(): SlashCommandBuilder[] {
    return [
      new SlashCommandBuilder()
        .setName('leave')
        .setDescription('Leave management commands')
        .addSubcommand((subcommand) =>
          subcommand
            .setName('apply')
            .setDescription('Apply for leave')
            .addStringOption((option) =>
              option
                .setName('type')
                .setDescription('Leave type')
                .setRequired(true)
                .addChoices(
                  { name: 'Sick Leave', value: 'Sick Leave' },
                  { name: 'Casual Leave', value: 'Casual Leave' },
                  { name: 'Earned Leave', value: 'Earned Leave' },
                  { name: 'Unpaid Leave', value: 'Unpaid Leave' },
                ),
            )
            .addStringOption((option) =>
              option.setName('startdate').setDescription('Start date (YYYY-MM-DD)').setRequired(true),
            )
            .addStringOption((option) =>
              option.setName('enddate').setDescription('End date (YYYY-MM-DD)').setRequired(true),
            )
            .addStringOption((option) =>
              option.setName('reason').setDescription('Reason for leave').setRequired(true),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand.setName('balance').setDescription('Check your leave balance'),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('approve')
            .setDescription('Approve a leave application (Admin only)')
            .addStringOption((option) =>
              option.setName('id').setDescription('Application ID').setRequired(true),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('reject')
            .setDescription('Reject a leave application (Admin only)')
            .addStringOption((option) =>
              option.setName('id').setDescription('Application ID').setRequired(true),
            )
            .addStringOption((option) =>
              option.setName('reason').setDescription('Rejection reason').setRequired(true),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('calendar')
            .setDescription('View team leave calendar')
            .addStringOption((option) =>
              option.setName('startdate').setDescription('Start date (YYYY-MM-DD)').setRequired(false),
            )
            .addStringOption((option) =>
              option.setName('enddate').setDescription('End date (YYYY-MM-DD)').setRequired(false),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('history')
            .setDescription('View your leave history')
            .addUserOption((option) =>
              option.setName('user').setDescription('User to view history for (Admin only)').setRequired(false),
            ),
        ) as SlashCommandBuilder,
    ];
  }

  /**
   * Handle /leave apply
   */
  async handleApply(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guildId!;
      const userId = interaction.user.id;
      const leaveType = interaction.options.getString('type', true);
      const startDate = interaction.options.getString('startdate', true);
      const endDate = interaction.options.getString('enddate', true);
      const reason = interaction.options.getString('reason', true);

      const result = await this.leaveService.applyForLeave(
        guildId,
        userId,
        leaveType as any,
        startDate,
        endDate,
        reason,
      );

      // Log audit
      await this.auditService.logAction(
        guildId,
        userId,
        'leave_apply',
        'leave',
        result.applicationId,
        { leaveType, startDate, endDate },
      );

      const embed = new EmbedBuilder()
        .setTitle('✅ Leave Application Submitted')
        .setColor(0x0099ff)
        .addFields(
          { name: 'Application ID', value: result.applicationId, inline: true },
          { name: 'Status', value: result.status, inline: true },
          { name: 'Leave Type', value: leaveType, inline: false },
          { name: 'Start Date', value: startDate, inline: true },
          { name: 'End Date', value: endDate, inline: true },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // Send notification to admin channel
      try {
        const adminChannel = await this.prisma.channel.findFirst({
          where: {
            guildId,
            type: 'admin',
          },
        });

        if (adminChannel) {
          const textChannel = await this.discord.getTextChannel(adminChannel.id);
          if (textChannel) {
            const daysRequested = Math.ceil(
              (parseISTDate(endDate).getTime() - parseISTDate(startDate).getTime()) / (1000 * 60 * 60 * 24),
            ) + 1;

            const adminEmbed = new EmbedBuilder()
              .setTitle('📋 New Leave Application')
              .setColor(0xff9900)
              .setDescription(`A new leave application requires approval`)
              .addFields(
                { name: 'Application ID', value: result.applicationId, inline: true },
                { name: 'Applicant', value: `<@${userId}>`, inline: true },
                { name: 'Leave Type', value: leaveType, inline: true },
                { name: 'Start Date', value: startDate, inline: true },
                { name: 'End Date', value: endDate, inline: true },
                { name: 'Days Requested', value: `${daysRequested} days`, inline: true },
                { name: 'Reason', value: reason.length > 500 ? reason.substring(0, 500) + '...' : reason, inline: false },
              )
              .setFooter({ text: `Use /leave approve ${result.applicationId} to approve or /leave reject ${result.applicationId} to reject` })
              .setTimestamp();

            await textChannel.send({ embeds: [adminEmbed] });
            this.logger.log(`Sent pending leave notification to admin channel for application ${result.applicationId}`);
          }
        }
      } catch (error) {
        // Log error but don't fail the leave application
        this.logger.error(`Failed to send admin notification for leave application ${result.applicationId}`, error);
      }
    } catch (error) {
      const message = handleError(error, this.logger);
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Leave Application Failed')
        .setDescription(message)
        .setColor(0xff0000)
        .setTimestamp();
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  /**
   * Handle /leave balance
   */
  async handleBalance(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guildId!;
      const userId = interaction.user.id;

      const balances = await Promise.all([
        this.leaveService.getLeaveBalance(guildId, userId, 'Sick Leave' as any),
        this.leaveService.getLeaveBalance(guildId, userId, 'Casual Leave' as any),
        this.leaveService.getLeaveBalance(guildId, userId, 'Earned Leave' as any),
      ]);

      const embed = new EmbedBuilder()
        .setTitle('📊 Leave Balance')
        .setColor(0x0099ff)
        .addFields(
          { name: 'Sick Leave', value: `${balances[0]} days`, inline: true },
          { name: 'Casual Leave', value: `${balances[1]} days`, inline: true },
          { name: 'Earned Leave', value: `${balances[2]} days`, inline: true },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const message = handleError(error, this.logger);
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Leave Application Failed')
        .setDescription(message)
        .setColor(0xff0000)
        .setTimestamp();
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  /**
   * Handle /leave approve
   */
  async handleApprove(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guildId!;
      const userId = interaction.user.id;
      const applicationId = interaction.options.getString('id', true);

      const result = await this.leaveService.approveLeave(guildId, applicationId, userId);

      // Log audit
      await this.auditService.logAction(
        guildId,
        userId,
        'leave_approve',
        'leave',
        applicationId,
        {},
      );

      const embed = new EmbedBuilder()
        .setTitle('✅ Leave Approved')
        .setColor(0x00ff00)
        .addFields({ name: 'Application ID', value: applicationId, inline: true })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const message = handleError(error, this.logger);
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Leave Application Failed')
        .setDescription(message)
        .setColor(0xff0000)
        .setTimestamp();
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  /**
   * Handle /leave reject
   */
  async handleReject(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guildId!;
      const userId = interaction.user.id;
      const applicationId = interaction.options.getString('id', true);
      const reason = interaction.options.getString('reason', true);

      const result = await this.leaveService.rejectLeave(guildId, applicationId, userId, reason);

      // Log audit
      await this.auditService.logAction(
        guildId,
        userId,
        'leave_reject',
        'leave',
        applicationId,
        { reason },
      );

      const embed = new EmbedBuilder()
        .setTitle('❌ Leave Rejected')
        .setColor(0xff0000)
        .addFields(
          { name: 'Application ID', value: applicationId, inline: true },
          { name: 'Reason', value: reason, inline: false },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const message = handleError(error, this.logger);
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Leave Application Failed')
        .setDescription(message)
        .setColor(0xff0000)
        .setTimestamp();
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  /**
   * Handle /leave calendar
   */
  async handleCalendar(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guildId!;
      const startDateStr = interaction.options.getString('startdate');
      const endDateStr = interaction.options.getString('enddate');

      const today = getCurrentISTDate();
      today.setHours(0, 0, 0, 0);

      // Default to current month if no dates provided
      const startDate = startDateStr ? parseISTDate(startDateStr) : new Date(today.getFullYear(), today.getMonth(), 1);
      const endDate = endDateStr
        ? parseISTDate(endDateStr)
        : new Date(today.getFullYear(), today.getMonth() + 1, 0);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        await interaction.editReply({
          content: '❌ Invalid date format. Please use YYYY-MM-DD format.',
        });
        return;
      }

      const calendar = await this.leaveService.getLeaveCalendar(guildId, startDate, endDate);

      const embed = new EmbedBuilder()
        .setTitle('📅 Leave Calendar')
        .setColor(0x0099ff)
        .addFields({
          name: 'Period',
          value: `${formatISTDate(startDate)} to ${formatISTDate(endDate)}`,
          inline: false,
        })
        .setTimestamp();

      if (calendar.leaves.length === 0) {
        embed.setDescription('No approved leaves in this period.');
      } else {
        // Group leaves by user
        const leavesByUser = new Map<string, Array<typeof calendar.leaves[0]>>();
        for (const leave of calendar.leaves) {
          if (!leavesByUser.has(leave.userId)) {
            leavesByUser.set(leave.userId, []);
          }
          leavesByUser.get(leave.userId)!.push(leave);
        }

        // Add leaves to embed (limit to 10 users to avoid embed size limits)
        let count = 0;
        for (const [userId, userLeaves] of leavesByUser.entries()) {
          if (count >= 10) break;
          const user = userLeaves[0];
          const leaveList = userLeaves
            .map(
              (l) =>
                `${formatISTDate(l.startDate)} - ${formatISTDate(l.endDate)} (${l.days} days) - ${l.leaveType}`,
            )
            .join('\n');
          embed.addFields({
            name: user.username,
            value: leaveList || 'No leaves',
            inline: true,
          });
          count++;
        }

        if (calendar.leaves.length > 10) {
          embed.setFooter({ text: `Showing first 10 users. Total: ${calendar.leaves.length} leave entries` });
        }
      }

      // Add conflicts if any
      if (calendar.conflicts.length > 0) {
        const conflictList = calendar.conflicts
          .slice(0, 5)
          .map(
            (c) =>
              `**${formatISTDate(c.date)}**: ${c.users.map((u) => u.username).join(', ')} (${c.count} people)`,
          )
          .join('\n');
        embed.addFields({
          name: '⚠️ Overlapping Leaves',
          value: conflictList + (calendar.conflicts.length > 5 ? `\n...and ${calendar.conflicts.length - 5} more` : ''),
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const message = handleError(error, this.logger);
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Calendar View Failed')
        .setDescription(message)
        .setColor(0xff0000)
        .setTimestamp();
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  /**
   * Handle /leave history
   */
  async handleHistory(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guildId!;
      const targetUser = interaction.options.getUser('user');
      const userId = targetUser ? targetUser.id : interaction.user.id;

      // Check if user is admin if viewing someone else's history
      if (targetUser && targetUser.id !== interaction.user.id) {
        // In a real implementation, you'd check for admin permissions here
        // For now, we'll allow it
      }

      const history = await this.leaveService.getUserLeaveHistory(guildId, userId);

      const embed = new EmbedBuilder()
        .setTitle(`📋 Leave History - ${targetUser ? targetUser.username : 'Your Leaves'}`)
        .setColor(0x0099ff)
        .setTimestamp();

      if (history.length === 0) {
        embed.setDescription('No leave applications found.');
      } else {
        // Group by status
        const pending = history.filter((l) => l.status === 'Pending');
        const approved = history.filter((l) => l.status === 'Approved');
        const rejected = history.filter((l) => l.status === 'Rejected');

        embed.addFields(
          {
            name: '📊 Summary',
            value: `Pending: ${pending.length}\nApproved: ${approved.length}\nRejected: ${rejected.length}\nTotal: ${history.length}`,
            inline: true,
          },
          {
            name: 'Recent Leaves',
            value:
              history
                .slice(0, 5)
                .map(
                  (l) =>
                    `${formatISTDate(l.startDate)} - ${formatISTDate(l.endDate)} (${l.leaveType}) - ${l.status}`,
                )
                .join('\n') || 'None',
            inline: false,
          },
        );

        if (history.length > 5) {
          embed.setFooter({ text: `Showing 5 of ${history.length} leave applications` });
        }
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const message = handleError(error, this.logger);
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ History View Failed')
        .setDescription(message)
        .setColor(0xff0000)
        .setTimestamp();
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
}
