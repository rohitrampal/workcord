import { SlashCommandBuilder, EmbedBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { ReportingService } from '@domain/reporting/reporting.service';
import { handleError } from '@shared/utils/errors';
import { Logger } from '@nestjs/common';
import { parseISTDate, formatISTDate } from '@shared/utils/date';

/**
 * Report Commands
 * Commands for generating and viewing reports
 */
export class ReportCommands {
  private readonly logger = new Logger(ReportCommands.name);

  constructor(private reportingService: ReportingService) {}

  /**
   * Register report commands
   */
  static getCommands(): SlashCommandBuilder[] {
    return [
      new SlashCommandBuilder()
        .setName('report')
        .setDescription('Generate and view reports')
        .addSubcommand((subcommand) =>
          subcommand
            .setName('attendance')
            .setDescription('Generate attendance report')
            .addStringOption((option) =>
              option
                .setName('type')
                .setDescription('Report type')
                .setRequired(true)
                .addChoices(
                  { name: 'Daily', value: 'daily' },
                  { name: 'Weekly', value: 'weekly' },
                  { name: 'Monthly', value: 'monthly' },
                  { name: 'Custom Range', value: 'custom' },
                ),
            )
            .addStringOption((option) =>
              option.setName('startdate').setDescription('Start date (YYYY-MM-DD, for custom)').setRequired(false),
            )
            .addStringOption((option) =>
              option.setName('enddate').setDescription('End date (YYYY-MM-DD, for custom)').setRequired(false),
            )
            .addUserOption((option) =>
              option.setName('user').setDescription('Filter by user').setRequired(false),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('leave')
            .setDescription('Generate leave report')
            .addStringOption((option) =>
              option
                .setName('status')
                .setDescription('Filter by status')
                .setRequired(false)
                .addChoices(
                  { name: 'Pending', value: 'Pending' },
                  { name: 'Approved', value: 'Approved' },
                  { name: 'Rejected', value: 'Rejected' },
                  { name: 'All', value: 'All' },
                ),
            )
            .addStringOption((option) =>
              option.setName('startdate').setDescription('Start date (YYYY-MM-DD)').setRequired(false),
            )
            .addStringOption((option) =>
              option.setName('enddate').setDescription('End date (YYYY-MM-DD)').setRequired(false),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('task')
            .setDescription('Generate task report')
            .addStringOption((option) =>
              option
                .setName('type')
                .setDescription('Report type')
                .setRequired(true)
                .addChoices(
                  { name: 'By Status', value: 'status' },
                  { name: 'By Assignee', value: 'assignee' },
                  { name: 'Overdue', value: 'overdue' },
                  { name: 'Completed', value: 'completed' },
                ),
            )
            .addStringOption((option) =>
              option.setName('filter').setDescription('Filter value (status or user ID)').setRequired(false),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('compliance')
            .setDescription('Generate compliance report')
            .addStringOption((option) =>
              option.setName('startdate').setDescription('Start date (YYYY-MM-DD)').setRequired(true),
            )
            .addStringOption((option) =>
              option.setName('enddate').setDescription('End date (YYYY-MM-DD)').setRequired(true),
            ),
        ) as SlashCommandBuilder,
    ];
  }

  /**
   * Handle /report attendance
   */
  async handleAttendance(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guildId!;
      const type = interaction.options.getString('type', true) as 'daily' | 'weekly' | 'monthly' | 'custom';
      const startDateStr = interaction.options.getString('startdate');
      const endDateStr = interaction.options.getString('enddate');
      const user = interaction.options.getUser('user');

      let startDate: Date | undefined;
      let endDate: Date | undefined;

      if (startDateStr) {
        try {
          startDate = parseISTDate(startDateStr);
        } catch (error) {
          await interaction.editReply({
            content: '❌ Invalid start date format. Use YYYY-MM-DD.',
          });
          return;
        }
      }

      if (endDateStr) {
        try {
          endDate = parseISTDate(endDateStr);
        } catch (error) {
          await interaction.editReply({
            content: '❌ Invalid end date format. Use YYYY-MM-DD.',
          });
          return;
        }
      }

      const report = await this.reportingService.generateAttendanceReport(
        guildId,
        type,
        startDate,
        endDate,
        user?.id,
      );

      const embed = new EmbedBuilder()
        .setTitle('📊 Attendance Report')
        .setColor(0x0099ff)
        .addFields(
          { name: 'Report Type', value: type.charAt(0).toUpperCase() + type.slice(1), inline: true },
          {
            name: 'Date Range',
            value: `${formatISTDate(report.startDate)} to ${formatISTDate(report.endDate)}`,
            inline: true,
          },
          { name: 'Total Records', value: report.summary.totalRecords.toString(), inline: true },
          { name: 'Present Days', value: report.summary.presentDays.toString(), inline: true },
          {
            name: 'Average Hours',
            value: report.summary.averageHours.toFixed(2) + ' hours',
            inline: true,
          },
        )
        .setTimestamp();

      if (report.records.length > 0) {
        const recentRecords = report.records.slice(0, 5);
        const recordsText = recentRecords
          .map(
            (r) =>
              `**${r.user?.username || 'Unknown'}** - ${r.checkInAt ? '✅ Checked in' : '❌ Absent'} ${r.hoursWorked ? `(${r.hoursWorked.toFixed(2)}h)` : ''}`,
          )
          .join('\n');
        embed.addFields({
          name: 'Recent Records',
          value: recordsText || 'No records',
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const message = handleError(error, this.logger);
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Attendance Report Failed')
        .setDescription(message)
        .setColor(0xff0000)
        .setTimestamp();
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  /**
   * Handle /report leave
   */
  async handleLeave(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guildId!;
      const status = (interaction.options.getString('status') || 'All') as
        | 'Pending'
        | 'Approved'
        | 'Rejected'
        | 'All';
      const startDateStr = interaction.options.getString('startdate');
      const endDateStr = interaction.options.getString('enddate');

      let startDate: Date | undefined;
      let endDate: Date | undefined;

      if (startDateStr) {
        try {
          startDate = parseISTDate(startDateStr);
        } catch (error) {
          await interaction.editReply({
            content: '❌ Invalid start date format. Use YYYY-MM-DD.',
          });
          return;
        }
      }

      if (endDateStr) {
        try {
          endDate = parseISTDate(endDateStr);
        } catch (error) {
          await interaction.editReply({
            content: '❌ Invalid end date format. Use YYYY-MM-DD.',
          });
          return;
        }
      }

      const report = await this.reportingService.generateLeaveReport(guildId, status, startDate, endDate);

      const embed = new EmbedBuilder()
        .setTitle('📋 Leave Report')
        .setColor(0x0099ff)
        .addFields(
          { name: 'Status Filter', value: status, inline: true },
          { name: 'Total Applications', value: report.summary.total.toString(), inline: true },
          { name: 'Pending', value: report.summary.pending.toString(), inline: true },
          { name: 'Approved', value: report.summary.approved.toString(), inline: true },
          { name: 'Rejected', value: report.summary.rejected.toString(), inline: true },
        )
        .setTimestamp();

      if (report.records.length > 0) {
        const recentRecords = report.records.slice(0, 5);
        const recordsText = recentRecords
          .map(
            (r) =>
              `**${r.user?.username || 'Unknown'}** - ${r.leaveType} (${formatISTDate(r.startDate)} to ${formatISTDate(r.endDate)}) - ${r.status}`,
          )
          .join('\n');
        embed.addFields({
          name: 'Recent Applications',
          value: recordsText || 'No records',
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const message = handleError(error, this.logger);
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Leave Report Failed')
        .setDescription(message)
        .setColor(0xff0000)
        .setTimestamp();
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  /**
   * Handle /report task
   */
  async handleTask(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guildId!;
      const type = interaction.options.getString('type', true) as 'status' | 'assignee' | 'overdue' | 'completed';
      const filter = interaction.options.getString('filter');

      const report = await this.reportingService.generateTaskReport(guildId, type, filter || undefined);

      const embed = new EmbedBuilder()
        .setTitle('📋 Task Report')
        .setColor(0x0099ff)
        .addFields(
          { name: 'Report Type', value: type.charAt(0).toUpperCase() + type.slice(1), inline: true },
          { name: 'Total Tasks', value: report.summary.total.toString(), inline: true },
          {
            name: 'Completion Rate',
            value: report.summary.completionRate.toFixed(2) + '%',
            inline: true,
          },
        )
        .setTimestamp();

      // Add status breakdown
      if (Object.keys(report.summary.byStatus).length > 0) {
        const statusText = Object.entries(report.summary.byStatus)
          .map(([status, count]) => `**${status}:** ${count}`)
          .join('\n');
        embed.addFields({ name: 'By Status', value: statusText, inline: true });
      }

      // Add priority breakdown
      if (Object.keys(report.summary.byPriority).length > 0) {
        const priorityText = Object.entries(report.summary.byPriority)
          .map(([priority, count]) => `**${priority}:** ${count}`)
          .join('\n');
        embed.addFields({ name: 'By Priority', value: priorityText, inline: true });
      }

      if (report.records.length > 0) {
        const recentTasks = report.records.slice(0, 5);
        const tasksText = recentTasks
          .map((t) => `**${t.title}** - ${t.status} (${t.priority})`)
          .join('\n');
        embed.addFields({
          name: 'Recent Tasks',
          value: tasksText || 'No tasks',
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const message = handleError(error, this.logger);
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Task Report Failed')
        .setDescription(message)
        .setColor(0xff0000)
        .setTimestamp();
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  /**
   * Handle /report compliance
   */
  async handleCompliance(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guildId!;
      const startDateStr = interaction.options.getString('startdate', true);
      const endDateStr = interaction.options.getString('enddate', true);

      let startDate: Date;
      let endDate: Date;

      try {
        startDate = parseISTDate(startDateStr);
      } catch (error) {
        await interaction.editReply({
          content: '❌ Invalid start date format. Use YYYY-MM-DD.',
        });
        return;
      }

      try {
        endDate = parseISTDate(endDateStr);
      } catch (error) {
        await interaction.editReply({
          content: '❌ Invalid end date format. Use YYYY-MM-DD.',
        });
        return;
      }

      const report = await this.reportingService.generateComplianceReport(guildId, startDate, endDate);

      const embed = new EmbedBuilder()
        .setTitle('📊 Compliance Report')
        .setColor(0x0099ff)
        .addFields(
          {
            name: 'Date Range',
            value: `${formatISTDate(report.startDate)} to ${formatISTDate(report.endDate)}`,
            inline: false,
          },
          {
            name: 'Average Compliance',
            value: `**To-Do:** ${report.average.todo.toFixed(2)}%\n**EOD:** ${report.average.update.toFixed(2)}%`,
            inline: false,
          },
        )
        .setTimestamp();

      if (report.channels.length > 0) {
        const channelsText = report.channels
          .map(
            (c) =>
              `**${c.channelName}**\nTo-Do: ${c.todoCompliance.toFixed(2)}% | EOD: ${c.updateCompliance.toFixed(2)}%`,
          )
          .join('\n\n');
        embed.addFields({
          name: 'Channel Breakdown',
          value: channelsText || 'No data',
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const message = handleError(error, this.logger);
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Compliance Report Failed')
        .setDescription(message)
        .setColor(0xff0000)
        .setTimestamp();
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
}
