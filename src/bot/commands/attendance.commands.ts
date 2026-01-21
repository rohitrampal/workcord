import { SlashCommandBuilder, EmbedBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { AttendanceService } from '@domain/hrms/attendance.service';
import { AuditService } from '@domain/audit/audit.service';
import { DiscordService } from '@infra/discord/discord.service';
import { handleError } from '@shared/utils/errors';
import { AttendanceLocation } from '@shared/types';
import { Logger } from '@nestjs/common';

/**
 * Attendance Commands
 */
export class AttendanceCommands {
  private readonly logger = new Logger(AttendanceCommands.name);

  constructor(
    private attendanceService: AttendanceService,
    private auditService: AuditService,
    private discord: DiscordService,
  ) {}

  /**
   * Register attendance commands
   */
  static getCommands(): SlashCommandBuilder[] {
    return [
      new SlashCommandBuilder()
        .setName('checkin')
        .setDescription('Check in for the day')
        .addStringOption((option) =>
          option
            .setName('location')
            .setDescription('Your work location')
            .setRequired(true)
            .addChoices(
              { name: 'Office', value: 'Office' },
              { name: 'WFH', value: 'WFH' },
              { name: 'Outdoor', value: 'Outdoor' },
              { name: 'Site Visit', value: 'Site Visit' },
            ),
        ),
      new SlashCommandBuilder()
        .setName('checkout')
        .setDescription('Check out for the day'),
    ];
  }

  /**
   * Handle /checkin command
   */
  async handleCheckIn(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guildId!;
      const userId = interaction.user.id;
      const location = interaction.options.getString('location', true) as AttendanceLocation;

      const result = await this.attendanceService.checkIn(guildId, userId, location);

      // Log audit
      await this.auditService.logAction(
        guildId,
        userId,
        'checkin',
        'attendance',
        result.id,
        { location },
      );

      // Send confirmation
      const embed = new EmbedBuilder()
        .setTitle('✅ Checked In Successfully')
        .setColor(0x00ff00)
        .addFields(
          { name: 'Location', value: location, inline: true },
          {
            name: 'Time',
            value: `<t:${Math.floor(result.checkInAt.getTime() / 1000)}:t>`,
            inline: true,
          },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // Announce in general channel
      const generalChannel = await this.discord.getTextChannel(
        interaction.guild!.channels.cache.find((c) => c.name === 'general')?.id || '',
      );
      if (generalChannel) {
        await generalChannel.send({
          content: `✅ ${interaction.user} checked in from **${location}**`,
        });
      }
    } catch (error) {
      const message = handleError(error, this.logger);
      await interaction.editReply({ content: `❌ ${message}` });
    }
  }

  /**
   * Handle /checkout command
   */
  async handleCheckOut(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guildId!;
      const userId = interaction.user.id;

      const result = await this.attendanceService.checkOut(guildId, userId);

      // Log audit
      await this.auditService.logAction(
        guildId,
        userId,
        'checkout',
        'attendance',
        result.id,
        { hoursWorked: result.hoursWorked },
      );

      // Send confirmation
      const embed = new EmbedBuilder()
        .setTitle('✅ Checked Out Successfully')
        .setColor(0x00ff00)
        .addFields({
          name: 'Hours Worked',
          value: `${result.hoursWorked.toFixed(2)} hours`,
          inline: true,
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const message = handleError(error, this.logger);
      await interaction.editReply({ content: `❌ ${message}` });
    }
  }
}
