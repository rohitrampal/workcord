import { SlashCommandBuilder, EmbedBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { AuditService } from '@domain/audit/audit.service';
import { PrismaService } from '@infra/database/prisma.service';
import { HrTicketService } from '@domain/concierge/hr-ticket.service';
import { KnowledgeBaseService } from '@domain/concierge/knowledge-base.service';
import { DiscordService } from '@infra/discord/discord.service';
import { handleError } from '@shared/utils/errors';
import { Logger } from '@nestjs/common';
import { formatISTDate, parseISTDate } from '@shared/utils/date';

/**
 * Admin Commands
 * Administrative commands for system management
 */
export class AdminCommands {
  private readonly logger = new Logger(AdminCommands.name);

  constructor(
    private auditService: AuditService,
    private prisma: PrismaService,
    private hrTicketService: HrTicketService,
    private knowledgeBaseService: KnowledgeBaseService,
    private discord: DiscordService,
  ) {}

  /**
   * Register admin commands
   */
  static getCommands(): SlashCommandBuilder[] {
    return [
      new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Administrative commands (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((subcommand) =>
          subcommand
            .setName('audit')
            .setDescription('View audit logs')
            .addStringOption((option) =>
              option
                .setName('action')
                .setDescription('Filter by action type')
                .setRequired(false)
                .addChoices(
                  { name: 'Check-in', value: 'check_in' },
                  { name: 'Check-out', value: 'check_out' },
                  { name: 'Leave Apply', value: 'leave_apply' },
                  { name: 'Leave Approve', value: 'leave_approve' },
                  { name: 'Leave Reject', value: 'leave_reject' },
                  { name: 'Task Create', value: 'task_create' },
                  { name: 'Task Update', value: 'task_update' },
                ),
            )
            .addUserOption((option) =>
              option.setName('user').setDescription('Filter by user').setRequired(false),
            )
            .addStringOption((option) =>
              option
                .setName('startdate')
                .setDescription('Start date (YYYY-MM-DD)')
                .setRequired(false),
            )
            .addStringOption((option) =>
              option.setName('enddate').setDescription('End date (YYYY-MM-DD)').setRequired(false),
            )
            .addIntegerOption((option) =>
              option.setName('limit').setDescription('Number of records (max 100)').setRequired(false),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('config')
            .setDescription('View or update bot configuration')
            .addStringOption((option) =>
              option
                .setName('setting')
                .setDescription('Setting to view/update')
                .setRequired(false)
                .addChoices(
                  { name: 'Todo Reminder Time', value: 'todoReminder' },
                  { name: 'EOD Reminder Time', value: 'eodReminder' },
                  { name: 'Todo Defaulter Check', value: 'todoDefaulter' },
                  { name: 'EOD Defaulter Check', value: 'eodDefaulter' },
                ),
            )
            .addStringOption((option) =>
              option.setName('value').setDescription('New value (HH:mm format for times)').setRequired(false),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('penalties')
            .setDescription('View or manage penalty points')
            .addUserOption((option) =>
              option.setName('user').setDescription('View penalties for user').setRequired(false),
            )
            .addStringOption((option) =>
              option
                .setName('action')
                .setDescription('Action to perform')
                .setRequired(false)
                .addChoices(
                  { name: 'View All', value: 'view' },
                  { name: 'Clear Penalties', value: 'clear' },
                ),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('bulk')
            .setDescription('Bulk operations')
            .addStringOption((option) =>
              option
                .setName('operation')
                .setDescription('Operation to perform')
                .setRequired(true)
                .addChoices(
                  { name: 'Export User Data', value: 'export' },
                  { name: 'Send Announcement', value: 'announce' },
                ),
            )
            .addStringOption((option) =>
              option.setName('message').setDescription('Announcement message').setRequired(false),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('ticket')
            .setDescription('Manage HR tickets')
            .addStringOption((option) =>
              option
                .setName('action')
                .setDescription('Action to perform')
                .setRequired(true)
                .addChoices(
                  { name: 'List Pending', value: 'list' },
                  { name: 'Respond', value: 'respond' },
                  { name: 'View', value: 'view' },
                  { name: 'Update Status', value: 'status' },
                ),
            )
            .addStringOption((option) =>
              option.setName('ticketid').setDescription('Ticket ID').setRequired(false),
            )
            .addStringOption((option) =>
              option.setName('response').setDescription('Response text').setRequired(false),
            )
            .addStringOption((option) =>
              option
                .setName('status')
                .setDescription('New status')
                .setRequired(false)
                .addChoices(
                  { name: 'Open', value: 'Open' },
                  { name: 'In Progress', value: 'In Progress' },
                  { name: 'Resolved', value: 'Resolved' },
                  { name: 'Closed', value: 'Closed' },
                ),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('kb')
            .setDescription('Manage Knowledge Base articles')
            .addStringOption((option) =>
              option
                .setName('action')
                .setDescription('Action to perform')
                .setRequired(true)
                .addChoices(
                  { name: 'Create Article', value: 'create' },
                  { name: 'Update Article', value: 'update' },
                  { name: 'Delete Article', value: 'delete' },
                  { name: 'List Articles', value: 'list' },
                ),
            )
            .addStringOption((option) =>
              option.setName('articleid').setDescription('Article ID (for update/delete)').setRequired(false),
            )
            .addStringOption((option) =>
              option.setName('title').setDescription('Article title').setRequired(false),
            )
            .addStringOption((option) =>
              option.setName('content').setDescription('Article content').setRequired(false),
            )
            .addStringOption((option) =>
              option
                .setName('category')
                .setDescription('Category')
                .setRequired(false)
                .addChoices(
                  { name: 'Policies', value: 'Policies' },
                  { name: 'Procedures', value: 'Procedures' },
                  { name: 'FAQs', value: 'FAQs' },
                ),
            )
            .addStringOption((option) =>
              option.setName('tags').setDescription('Comma-separated tags').setRequired(false),
            ),
        ) as SlashCommandBuilder,
    ];
  }

  /**
   * Handle /admin audit
   */
  async handleAudit(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guildId!;
      const action = interaction.options.getString('action');
      const user = interaction.options.getUser('user');
      const startDateStr = interaction.options.getString('startdate');
      const endDateStr = interaction.options.getString('enddate');
      const limit = interaction.options.getInteger('limit') || 50;

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
          endDate.setHours(23, 59, 59, 999); // End of day
        } catch (error) {
          await interaction.editReply({
            content: '❌ Invalid end date format. Use YYYY-MM-DD.',
          });
          return;
        }
      }

      const logs = await this.auditService.getAuditLogs(guildId, {
        userId: user?.id,
        action: action || undefined,
        startDate,
        endDate,
        limit: Math.min(limit, 100),
      });

      if (logs.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle('📋 Audit Logs')
          .setDescription('No audit logs found matching your criteria.')
          .setColor(0x0099ff)
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('📋 Audit Logs')
        .setDescription(`Found ${logs.length} audit log entries`)
        .setColor(0x0099ff)
        .setTimestamp();

      // Show first 10 entries in embed
      const displayLogs = logs.slice(0, 10);
      for (const log of displayLogs) {
        const timestamp = new Date(log.createdAt).toLocaleString('en-US', {
          timeZone: 'Asia/Kolkata',
        });
        embed.addFields({
          name: `${log.action} - ${log.user.username}`,
          value: `**Type:** ${log.entityType || 'N/A'}\n**Time:** ${timestamp}\n**ID:** ${log.entityId || 'N/A'}`,
          inline: false,
        });
      }

      if (logs.length > 10) {
        embed.setFooter({ text: `Showing 10 of ${logs.length} entries. Use filters to narrow results.` });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const message = handleError(error, this.logger);
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Audit Log Failed')
        .setDescription(message)
        .setColor(0xff0000)
        .setTimestamp();
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  /**
   * Handle /admin config
   */
  async handleConfig(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guildId!;
      const setting = interaction.options.getString('setting');
      const value = interaction.options.getString('value');

      const guild = await this.prisma.guild.findUnique({
        where: { id: guildId },
      });

      if (!guild) {
        await interaction.editReply({ content: '❌ Guild not found.' });
        return;
      }

      const reminderTimes = (guild.reminderTimes as any) || {
        todoReminder: '09:15',
        eodReminder: '18:00',
        defaulterCheck: { todo: '10:00', eod: '19:00' },
      };

      if (!setting) {
        // Show current configuration
        const embed = new EmbedBuilder()
          .setTitle('⚙️ Bot Configuration')
          .setColor(0x0099ff)
          .addFields(
            { name: 'Todo Reminder', value: reminderTimes.todoReminder || '09:15', inline: true },
            { name: 'EOD Reminder', value: reminderTimes.eodReminder || '18:00', inline: true },
            {
              name: 'Todo Defaulter Check',
              value: reminderTimes.defaulterCheck?.todo || '10:00',
              inline: true,
            },
            {
              name: 'EOD Defaulter Check',
              value: reminderTimes.defaulterCheck?.eod || '19:00',
              inline: true,
            },
          )
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Update configuration
      if (!value) {
        await interaction.editReply({
          content: '❌ Please provide a value to update the setting.',
        });
        return;
      }

      // Validate time format (HH:mm)
      if (setting.includes('Reminder') || setting.includes('Defaulter')) {
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(value)) {
          await interaction.editReply({
            content: '❌ Invalid time format. Use HH:mm (e.g., 09:15).',
          });
          return;
        }
      }

      // Update the setting
      if (setting === 'todoReminder') {
        reminderTimes.todoReminder = value;
      } else if (setting === 'eodReminder') {
        reminderTimes.eodReminder = value;
      } else if (setting === 'todoDefaulter') {
        reminderTimes.defaulterCheck = reminderTimes.defaulterCheck || {};
        reminderTimes.defaulterCheck.todo = value;
      } else if (setting === 'eodDefaulter') {
        reminderTimes.defaulterCheck = reminderTimes.defaulterCheck || {};
        reminderTimes.defaulterCheck.eod = value;
      }

      await this.prisma.guild.update({
        where: { id: guildId },
        data: { reminderTimes },
      });

      const embed = new EmbedBuilder()
        .setTitle('✅ Configuration Updated')
        .setDescription(`**${setting}** has been set to **${value}**`)
        .setColor(0x00ff00)
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const message = handleError(error, this.logger);
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Configuration Failed')
        .setDescription(message)
        .setColor(0xff0000)
        .setTimestamp();
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  /**
   * Handle /admin penalties
   */
  async handlePenalties(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guildId!;
      const user = interaction.options.getUser('user');
      const action = interaction.options.getString('action') || 'view';

      // Note: Penalty system is not fully implemented yet
      // This is a placeholder that shows the structure
      const embed = new EmbedBuilder()
        .setTitle('⚠️ Penalty System')
        .setDescription(
          'Penalty system is currently under development. Penalty points will be automatically assigned when users miss To-Do or EOD updates.',
        )
        .setColor(0xff9900)
        .addFields({
          name: 'Current Configuration',
          value: 'Penalty points are configured but not yet enforced.',
          inline: false,
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const message = handleError(error, this.logger);
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Penalty Management Failed')
        .setDescription(message)
        .setColor(0xff0000)
        .setTimestamp();
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  /**
   * Handle /admin bulk
   */
  async handleBulk(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const operation = interaction.options.getString('operation', true);
      const message = interaction.options.getString('message');

      if (operation === 'export') {
        // Export user data
        const embed = new EmbedBuilder()
          .setTitle('📊 Data Export')
          .setDescription('Data export functionality is coming soon. This will allow you to export all user data in CSV format.')
          .setColor(0x0099ff)
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
      } else if (operation === 'announce') {
        if (!message) {
          await interaction.editReply({
            content: '❌ Please provide an announcement message.',
          });
          return;
        }

        // Send announcement to #general channel
        const generalChannel = await this.prisma.channel.findFirst({
          where: {
            guildId: interaction.guildId!,
            type: 'general',
          },
        });

        if (generalChannel) {
          const channel = await interaction.client.channels.fetch(generalChannel.id);
          if (channel && channel.isTextBased()) {
            const embed = new EmbedBuilder()
              .setTitle('📢 Announcement')
              .setDescription(message)
              .setColor(0x0099ff)
              .setFooter({ text: `From ${interaction.user.tag}` })
              .setTimestamp();
            
            // Type assertion for text-based channels that support send
            const textChannel = channel as any;
            if (textChannel.send) {
              await textChannel.send({ embeds: [embed] });
              await interaction.editReply({
                content: '✅ Announcement sent to #general channel.',
              });
            } else {
              await interaction.editReply({
                content: '❌ Channel does not support sending messages.',
              });
            }
          } else {
            await interaction.editReply({
              content: '❌ Could not access #general channel.',
            });
          }
        } else {
          await interaction.editReply({
            content: '❌ #general channel not found.',
          });
        }
      }
    } catch (error) {
      const message = handleError(error, this.logger);
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Bulk Operation Failed')
        .setDescription(message)
        .setColor(0xff0000)
        .setTimestamp();
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  /**
   * Handle /admin ticket
   */
  async handleTicket(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guildId!;
      const userId = interaction.user.id;
      const action = interaction.options.getString('action', true);
      const ticketId = interaction.options.getString('ticketid');
      const response = interaction.options.getString('response');
      const status = interaction.options.getString('status');

      if (action === 'list') {
        const tickets = await this.hrTicketService.getPendingTickets(guildId);

        if (tickets.length === 0) {
          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setTitle('🎫 HR Tickets')
                .setDescription('No pending tickets found.')
                .setColor(0x0099ff)
                .setTimestamp(),
            ],
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle('🎫 Pending HR Tickets')
          .setDescription(`Found ${tickets.length} pending ticket(s)`)
          .setColor(0x0099ff)
          .setTimestamp();

        // Show first 10 tickets
        for (const ticket of tickets.slice(0, 10)) {
          embed.addFields({
            name: `Ticket ${ticket.ticketId}`,
            value: `**User:** <@${ticket.userId}>\n**Category:** ${ticket.category}\n**Status:** ${ticket.status}\n**Question:** ${ticket.question.length > 100 ? ticket.question.substring(0, 100) + '...' : ticket.question}`,
            inline: false,
          });
        }

        if (tickets.length > 10) {
          embed.setFooter({ text: `Showing 10 of ${tickets.length} tickets` });
        }

        await interaction.editReply({ embeds: [embed] });
      } else if (action === 'view') {
        if (!ticketId) {
          await interaction.editReply({ content: '❌ Ticket ID is required' });
          return;
        }

        const ticket = await this.hrTicketService.getTicket(guildId, ticketId);

        // Log audit
        await this.auditService.logAction(guildId, userId, 'hr_ticket_viewed', 'hr_ticket', ticketId, {});

        const embed = new EmbedBuilder()
          .setTitle(`🎫 Ticket ${ticket.ticketId}`)
          .setColor(0x0099ff)
          .addFields(
            { name: 'User', value: `<@${ticket.userId}>`, inline: true },
            { name: 'Category', value: ticket.category, inline: true },
            { name: 'Status', value: ticket.status, inline: true },
            { name: 'Question', value: ticket.question, inline: false },
          )
          .setTimestamp(new Date(ticket.createdAt));

        if (ticket.response) {
          embed.addFields({
            name: 'Response',
            value: ticket.response,
            inline: false,
          });
          if (ticket.respondedBy) {
            embed.addFields({
              name: 'Responded By',
              value: `<@${ticket.respondedBy}>`,
              inline: true,
            });
          }
          if (ticket.respondedAt) {
            embed.addFields({
              name: 'Responded At',
              value: formatISTDate(ticket.respondedAt),
              inline: true,
            });
          }
        }

        if (ticket.assignedTo) {
          embed.addFields({
            name: 'Assigned To',
            value: `<@${ticket.assignedTo}>`,
            inline: true,
          });
        }

        await interaction.editReply({ embeds: [embed] });
      } else if (action === 'respond') {
        if (!ticketId || !response) {
          await interaction.editReply({ content: '❌ Ticket ID and response are required' });
          return;
        }

        const result = await this.hrTicketService.respondToTicket(guildId, ticketId, userId, response);

        // Log audit
        await this.auditService.logAction(guildId, userId, 'hr_ticket_responded', 'hr_ticket', ticketId, {
          responseLength: response.length,
        });

        const embed = new EmbedBuilder()
          .setTitle('✅ Ticket Responded')
          .setDescription(`Response has been added to ticket ${ticketId}`)
          .addFields(
            { name: 'Ticket ID', value: ticketId, inline: true },
            { name: 'Status', value: result.status, inline: true },
          )
          .setColor(0x00ff00)
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else if (action === 'status') {
        if (!ticketId || !status) {
          await interaction.editReply({ content: '❌ Ticket ID and status are required' });
          return;
        }

        const result = await this.hrTicketService.updateTicketStatus(guildId, ticketId, status);

        // Log audit
        await this.auditService.logAction(guildId, userId, 'hr_ticket_status_updated', 'hr_ticket', ticketId, {
          newStatus: status,
        });

        const embed = new EmbedBuilder()
          .setTitle('✅ Ticket Status Updated')
          .setDescription(`Ticket ${ticketId} status has been updated`)
          .addFields(
            { name: 'Ticket ID', value: ticketId, inline: true },
            { name: 'New Status', value: result.status, inline: true },
          )
          .setColor(0x00ff00)
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      const message = handleError(error, this.logger);
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Ticket Operation Failed')
        .setDescription(message)
        .setColor(0xff0000)
        .setTimestamp();
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  /**
   * Handle /admin kb
   */
  async handleKnowledgeBase(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guildId!;
      const userId = interaction.user.id;
      const action = interaction.options.getString('action', true);
      const articleId = interaction.options.getString('articleid');
      const title = interaction.options.getString('title');
      const content = interaction.options.getString('content');
      const category = interaction.options.getString('category');
      const tagsStr = interaction.options.getString('tags');

      if (action === 'create') {
        if (!title || !content || !category) {
          await interaction.editReply({ content: '❌ Title, content, and category are required' });
          return;
        }

        const tags = tagsStr ? tagsStr.split(',').map((t) => t.trim()) : [];

        const article = await this.knowledgeBaseService.createArticle(
          guildId,
          title,
          content,
          category,
          tags,
          userId,
        );

        // Log audit
        await this.auditService.logAction(guildId, userId, 'kb_article_created', 'knowledge_article', article.id, {
          title,
          category,
          tagsCount: tags.length,
        });

        const embed = new EmbedBuilder()
          .setTitle('✅ Article Created')
          .setDescription(`Knowledge base article has been created successfully.`)
          .addFields(
            { name: 'Article ID', value: article.id, inline: true },
            { name: 'Title', value: title, inline: false },
            { name: 'Category', value: category, inline: true },
            { name: 'Tags', value: tags.length > 0 ? tags.join(', ') : 'None', inline: false },
          )
          .setColor(0x00ff00)
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else if (action === 'update') {
        if (!articleId) {
          await interaction.editReply({ content: '❌ Article ID is required' });
          return;
        }

        const tags = tagsStr ? tagsStr.split(',').map((t) => t.trim()) : undefined;

        const article = await this.knowledgeBaseService.updateArticle(
          guildId,
          articleId,
          userId,
          title || undefined,
          content || undefined,
          category || undefined,
          tags,
        );

        // Log audit
        await this.auditService.logAction(guildId, userId, 'kb_article_updated', 'knowledge_article', articleId, {
          updatedFields: { title: !!title, content: !!content, category: !!category, tags: !!tagsStr },
        });

        const embed = new EmbedBuilder()
          .setTitle('✅ Article Updated')
          .setDescription(`Knowledge base article has been updated successfully.`)
          .addFields({ name: 'Article ID', value: articleId, inline: true })
          .setColor(0x00ff00)
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else if (action === 'delete') {
        if (!articleId) {
          await interaction.editReply({ content: '❌ Article ID is required' });
          return;
        }

        await this.knowledgeBaseService.deleteArticle(guildId, articleId);

        // Log audit
        await this.auditService.logAction(guildId, userId, 'kb_article_deleted', 'knowledge_article', articleId, {});

        const embed = new EmbedBuilder()
          .setTitle('✅ Article Deleted')
          .setDescription(`Knowledge base article has been deleted (unpublished).`)
          .addFields({ name: 'Article ID', value: articleId, inline: true })
          .setColor(0x00ff00)
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else if (action === 'list') {
        const categories = await this.knowledgeBaseService.getCategories(guildId);

        if (categories.length === 0) {
          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setTitle('📚 Knowledge Base')
                .setDescription('No articles found. Use `/admin kb create` to add articles.')
                .setColor(0x0099ff)
                .setTimestamp(),
            ],
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle('📚 Knowledge Base Categories')
          .setDescription(`Available categories: ${categories.join(', ')}`)
          .setColor(0x0099ff)
          .setTimestamp();

        // Show article count per category
        for (const cat of categories) {
          const articles = await this.knowledgeBaseService.getArticlesByCategory(guildId, cat);
          embed.addFields({
            name: cat,
            value: `${articles.length} article(s)`,
            inline: true,
          });
        }

        embed.setFooter({ text: 'Use /knowledgebase browse <category> to view articles' });

        await interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      const message = handleError(error, this.logger);
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Knowledge Base Operation Failed')
        .setDescription(message)
        .setColor(0xff0000)
        .setTimestamp();
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
}
