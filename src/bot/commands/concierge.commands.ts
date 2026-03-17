import { SlashCommandBuilder, EmbedBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { ConciergeService } from '@domain/concierge/concierge.service';
import { HrTicketService } from '@domain/concierge/hr-ticket.service';
import { KnowledgeBaseService } from '@domain/concierge/knowledge-base.service';
import { DiscordService } from '@infra/discord/discord.service';
import { PrismaService } from '@infra/database/prisma.service';
import { AuditService } from '@domain/audit/audit.service';
import { handleError } from '@shared/utils/errors';
import { Logger } from '@nestjs/common';

/**
 * Concierge Commands
 */
export class ConciergeCommands {
  private readonly logger = new Logger(ConciergeCommands.name);

  constructor(
    private conciergeService: ConciergeService,
    private hrTicketService: HrTicketService,
    private knowledgeBaseService: KnowledgeBaseService,
    private discord: DiscordService,
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

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
        .setDescription('Access company documentation')
        .addSubcommand((subcommand) =>
          subcommand
            .setName('search')
            .setDescription('Search knowledge base articles')
            .addStringOption((option) =>
              option.setName('query').setDescription('Search query').setRequired(true),
            )
            .addStringOption((option) =>
              option
                .setName('category')
                .setDescription('Filter by category')
                .addChoices(
                  { name: 'Policies', value: 'Policies' },
                  { name: 'Procedures', value: 'Procedures' },
                  { name: 'FAQs', value: 'FAQs' },
                ),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('browse')
            .setDescription('Browse articles by category')
            .addStringOption((option) =>
              option
                .setName('category')
                .setDescription('Category to browse')
                .setRequired(true)
                .addChoices(
                  { name: 'Policies', value: 'Policies' },
                  { name: 'Procedures', value: 'Procedures' },
                  { name: 'FAQs', value: 'FAQs' },
                ),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('view')
            .setDescription('View a specific article')
            .addStringOption((option) =>
              option.setName('articleid').setDescription('Article ID').setRequired(true),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('feedback')
            .setDescription('Provide feedback on an article')
            .addStringOption((option) =>
              option.setName('articleid').setDescription('Article ID').setRequired(true),
            )
            .addBooleanOption((option) =>
              option.setName('helpful').setDescription('Was this article helpful?').setRequired(true),
            ),
        ) as SlashCommandBuilder,
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

      const guildId = interaction.guildId!;
      const userId = interaction.user.id;
      const category = interaction.options.getString('category', true);
      const question = interaction.options.getString('question', true);

      // Create ticket
      const result = await this.hrTicketService.createTicket(guildId, userId, category, question);

      // Log audit
      await this.auditService.logAction(guildId, userId, 'hr_ticket_created', 'hr_ticket', result.ticketId, {
        category,
        questionLength: question.length,
      });

      const embed = new EmbedBuilder()
        .setTitle('✅ HR Ticket Created')
        .setColor(0x0099ff)
        .addFields(
          { name: 'Ticket ID', value: result.ticketId, inline: true },
          { name: 'Category', value: category, inline: true },
          { name: 'Status', value: result.status, inline: true },
          { name: 'Question', value: question.length > 500 ? question.substring(0, 500) + '...' : question, inline: false },
        )
        .setDescription('Your HR query has been submitted. An admin will respond soon.')
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
            const adminEmbed = new EmbedBuilder()
              .setTitle('🎫 New HR Ticket')
              .setColor(0xff9900)
              .setDescription(`A new HR ticket requires attention`)
              .addFields(
                { name: 'Ticket ID', value: result.ticketId, inline: true },
                { name: 'Applicant', value: `<@${userId}>`, inline: true },
                { name: 'Category', value: category, inline: true },
                { name: 'Status', value: result.status, inline: true },
                {
                  name: 'Question',
                  value: question.length > 1000 ? question.substring(0, 1000) + '...' : question,
                  inline: false,
                },
              )
              .setFooter({ text: `Use /admin ticket respond ${result.ticketId} to respond` })
              .setTimestamp();

            await textChannel.send({ embeds: [adminEmbed] });
            this.logger.log(`Sent HR ticket notification to admin channel for ticket ${result.ticketId}`);
          }
        }
      } catch (error) {
        // Log error but don't fail the ticket creation
        this.logger.error(`Failed to send admin notification for ticket ${result.ticketId}`, error);
      }
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

      const guildId = interaction.guildId!;
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'search') {
        const query = interaction.options.getString('query', true);
        const category = interaction.options.getString('category');

        const articles = await this.knowledgeBaseService.searchArticles(guildId, query, category || undefined);

        if (articles.length === 0) {
          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setTitle('📚 Knowledge Base Search')
                .setDescription(`No articles found for "${query}"${category ? ` in ${category}` : ''}`)
                .setColor(0xff9900)
                .setTimestamp(),
            ],
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle('📚 Search Results')
          .setDescription(`Found ${articles.length} article(s) for "${query}"`)
          .setColor(0x0099ff)
          .setTimestamp();

        articles.slice(0, 5).forEach((article) => {
          embed.addFields({
            name: `${article.title} (ID: \`${article.id}\`)`,
            value: `${article.category} • ${article.views} views • ${article.helpful} helpful\n${article.content.substring(0, 100)}...`,
            inline: false,
          });
        });

        if (articles.length > 5) {
          embed.setFooter({ text: `Showing 5 of ${articles.length} results. Use /knowledgebase view <id> to read full article` });
        } else {
          embed.setFooter({ text: 'Use /knowledgebase view <id> to read full article' });
        }

        await interaction.editReply({ embeds: [embed] });
      } else if (subcommand === 'browse') {
        const category = interaction.options.getString('category', true);

        const articles = await this.knowledgeBaseService.getArticlesByCategory(guildId, category);

        if (articles.length === 0) {
          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setTitle('📚 Knowledge Base')
                .setDescription(`No articles found in ${category}`)
                .setColor(0xff9900)
                .setTimestamp(),
            ],
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle(`📚 ${category}`)
          .setDescription(`Found ${articles.length} article(s)`)
          .setColor(0x0099ff)
          .setTimestamp();

        articles.slice(0, 10).forEach((article) => {
          embed.addFields({
            name: `${article.title} (ID: \`${article.id}\`)`,
            value: `${article.views} views • ${article.helpful} helpful • ${article.notHelpful} not helpful`,
            inline: false,
          });
        });

        if (articles.length > 10) {
          embed.setFooter({ text: `Showing 10 of ${articles.length} articles. Use /knowledgebase view <id> to read` });
        } else {
          embed.setFooter({ text: 'Use /knowledgebase view <id> to read article' });
        }

        await interaction.editReply({ embeds: [embed] });
      } else if (subcommand === 'view') {
        const articleId = interaction.options.getString('articleid', true);

        const article = await this.knowledgeBaseService.getArticle(guildId, articleId);

        const embed = new EmbedBuilder()
          .setTitle(article.title)
          .setDescription(article.content)
          .setColor(0x0099ff)
          .addFields(
            { name: 'Category', value: article.category, inline: true },
            { name: 'Views', value: `${article.views}`, inline: true },
            { name: 'Helpful', value: `${article.helpful}`, inline: true },
            { name: 'Not Helpful', value: `${article.notHelpful}`, inline: true },
            {
              name: 'Tags',
              value: article.tags.length > 0 ? article.tags.join(', ') : 'None',
              inline: false,
            },
          )
          .setFooter({ text: `Article ID: ${article.id} • Use /knowledgebase feedback to rate this article` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else if (subcommand === 'feedback') {
        const articleId = interaction.options.getString('articleid', true);
        const helpful = interaction.options.getBoolean('helpful', true);

        await this.knowledgeBaseService.updateFeedback(articleId, helpful);

        const embed = new EmbedBuilder()
          .setTitle('✅ Feedback Submitted')
          .setDescription(`Thank you for your feedback! The article has been marked as ${helpful ? 'helpful' : 'not helpful'}.`)
          .setColor(0x00ff00)
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      const message = handleError(error, this.logger);
      await interaction.editReply({ content: `❌ ${message}` });
    }
  }
}
