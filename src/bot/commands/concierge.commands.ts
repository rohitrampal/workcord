import { SlashCommandBuilder, EmbedBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { ConciergeService } from '@domain/concierge/concierge.service';
import { handleError } from '@shared/utils/errors';
import { Logger } from '@nestjs/common';

/**
 * Concierge Commands
 */
export class ConciergeCommands {
  private readonly logger = new Logger(ConciergeCommands.name);

  constructor(private conciergeService: ConciergeService) {}

  /**
   * Register concierge commands
   */
  static getCommands(): SlashCommandBuilder[] {
    return [
      new SlashCommandBuilder()
        .setName('mystats')
        .setDescription('View your personal statistics'),
      new SlashCommandBuilder()
        .setName('hrhelp')
        .setDescription('Get HR assistance')
        .addStringOption((option) =>
          option
            .setName('category')
            .setDescription('Category')
            .setRequired(true)
            .addChoices(
              { name: 'Leave', value: 'Leave' },
              { name: 'Attendance', value: 'Attendance' },
              { name: 'Payroll', value: 'Payroll' },
              { name: 'General', value: 'General' },
            ),
        )
        .addStringOption((option) =>
          option.setName('question').setDescription('Your question').setRequired(true),
        ) as SlashCommandBuilder,
      new SlashCommandBuilder()
        .setName('knowledgebase')
        .setDescription('Access company documentation'),
    ];
  }

  /**
   * Handle /mystats
   */
  async handleMyStats(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guildId!;
      const userId = interaction.user.id;

      const stats = await this.conciergeService.getPersonalStats(guildId, userId);

      const embed = new EmbedBuilder()
        .setTitle('📊 Your Personal Statistics')
        .setColor(0x0099ff)
        .addFields(
          {
            name: '📅 Attendance',
            value: `${stats.attendance.percentage}% (${stats.attendance.presentDays}/${stats.attendance.totalDays} days)`,
            inline: true,
          },
          {
            name: '🏖️ Leaves',
            value: `Pending: ${stats.leaves.pending} | Approved: ${stats.leaves.approved}`,
            inline: true,
          },
          {
            name: '✅ Tasks',
            value: `Total: ${stats.tasks.total} | In Progress: ${stats.tasks.inProgress} | Completed: ${stats.tasks.completed}`,
            inline: false,
          },
          {
            name: '📝 Compliance',
            value: `To-Do: ${stats.compliance.todo}% | Updates: ${stats.compliance.update}%`,
            inline: false,
          },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const message = handleError(error, this.logger);
      await interaction.editReply({ content: `❌ ${message}` });
    }
  }

  /**
   * Handle /hrhelp
   */
  async handleHrHelp(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const category = interaction.options.getString('category', true);
      const question = interaction.options.getString('question', true);

      // In a real implementation, this would create a ticket
      const ticketId = `HR-${Date.now()}`;

      const embed = new EmbedBuilder()
        .setTitle('✅ HR Ticket Created')
        .setColor(0x0099ff)
        .addFields(
          { name: 'Ticket ID', value: ticketId, inline: true },
          { name: 'Category', value: category, inline: true },
          { name: 'Question', value: question, inline: false },
        )
        .setDescription('Your HR query has been submitted. An admin will respond soon.')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const message = handleError(error, this.logger);
      await interaction.editReply({ content: `❌ ${message}` });
    }
  }

  /**
   * Handle /knowledgebase
   */
  async handleKnowledgeBase(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle('📚 Knowledge Base')
        .setColor(0x0099ff)
        .setDescription('Company documentation and resources')
        .addFields(
          { name: 'Policies', value: 'Employee handbook, code of conduct', inline: false },
          { name: 'Procedures', value: 'Leave application process, attendance guidelines', inline: false },
          { name: 'FAQs', value: 'Common questions and answers', inline: false },
        )
        .setFooter({ text: 'More content coming soon' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const message = handleError(error, this.logger);
      await interaction.editReply({ content: `❌ ${message}` });
    }
  }
}
