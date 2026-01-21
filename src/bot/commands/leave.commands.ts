import { SlashCommandBuilder, EmbedBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { LeaveService } from '@domain/hrms/leave.service';
import { AuditService } from '@domain/audit/audit.service';
import { handleError } from '@shared/utils/errors';
import { Logger } from '@nestjs/common';

/**
 * Leave Commands
 */
export class LeaveCommands {
  private readonly logger = new Logger(LeaveCommands.name);

  constructor(
    private leaveService: LeaveService,
    private auditService: AuditService,
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
        ),
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
    } catch (error) {
      const message = handleError(error, this.logger);
      await interaction.editReply({ content: `❌ ${message}` });
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
      await interaction.editReply({ content: `❌ ${message}` });
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
      await interaction.editReply({ content: `❌ ${message}` });
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
      await interaction.editReply({ content: `❌ ${message}` });
    }
  }
}
