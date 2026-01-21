import { SlashCommandBuilder, EmbedBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { TaskService } from '@domain/tasks/task.service';
import { AuditService } from '@domain/audit/audit.service';
import { handleError } from '@shared/utils/errors';
import { Logger } from '@nestjs/common';

/**
 * Task Commands
 */
export class TaskCommands {
  private readonly logger = new Logger(TaskCommands.name);

  constructor(
    private taskService: TaskService,
    private auditService: AuditService,
  ) {}

  /**
   * Register task commands
   */
  static getCommands(): SlashCommandBuilder[] {
    return [
      new SlashCommandBuilder()
        .setName('task')
        .setDescription('Task management commands')
        .addSubcommand((subcommand) =>
          subcommand
            .setName('create')
            .setDescription('Create a new task')
            .addStringOption((option) =>
              option.setName('title').setDescription('Task title').setRequired(true),
            )
            .addUserOption((option) =>
              option.setName('assignee').setDescription('Assign to user').setRequired(true),
            )
            .addStringOption((option) =>
              option.setName('description').setDescription('Task description'),
            )
            .addStringOption((option) =>
              option.setName('duedate').setDescription('Due date (YYYY-MM-DD)'),
            )
            .addStringOption((option) =>
              option
                .setName('priority')
                .setDescription('Task priority')
                .addChoices(
                  { name: 'Low', value: 'Low' },
                  { name: 'Normal', value: 'Normal' },
                  { name: 'High', value: 'High' },
                  { name: 'Critical', value: 'Critical' },
                ),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('update')
            .setDescription('Update task status')
            .addStringOption((option) =>
              option.setName('id').setDescription('Task ID').setRequired(true),
            )
            .addStringOption((option) =>
              option
                .setName('status')
                .setDescription('New status')
                .addChoices(
                  { name: 'Not Started', value: 'Not Started' },
                  { name: 'In Progress', value: 'In Progress' },
                  { name: 'Blocked', value: 'Blocked' },
                  { name: 'Completed', value: 'Completed' },
                  { name: 'Cancelled', value: 'Cancelled' },
                ),
            )
            .addStringOption((option) =>
              option.setName('blockerreason').setDescription('Blocker reason (if blocked)'),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand.setName('mylist').setDescription('View your assigned tasks'),
        )
        .addSubcommand((subcommand) =>
          subcommand.setName('teamlist').setDescription('View team tasks'),
        ) as SlashCommandBuilder,
    ];
  }

  /**
   * Handle /task create
   */
  async handleCreate(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guildId!;
      const creatorId = interaction.user.id;
      const title = interaction.options.getString('title', true);
      const assignee = interaction.options.getUser('assignee', true);
      const description = interaction.options.getString('description');
      const dueDate = interaction.options.getString('duedate');
      const priority = interaction.options.getString('priority');

      const result = await this.taskService.createTask(
        guildId,
        creatorId,
        title,
        assignee.id,
        description || undefined,
        dueDate || undefined,
        priority as any,
      );

      // Log audit
      await this.auditService.logAction(
        guildId,
        creatorId,
        'task_create',
        'task',
        result.id,
        { title, assigneeId: assignee.id },
      );

      const embed = new EmbedBuilder()
        .setTitle('✅ Task Created')
        .setColor(0x0099ff)
        .addFields(
          { name: 'Task ID', value: result.id, inline: true },
          { name: 'Title', value: title, inline: false },
          { name: 'Assignee', value: `<@${assignee.id}>`, inline: true },
          { name: 'Status', value: result.status, inline: true },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const message = handleError(error, this.logger);
      await interaction.editReply({ content: `❌ ${message}` });
    }
  }

  /**
   * Handle /task update
   */
  async handleUpdate(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const taskId = interaction.options.getString('id', true);
      const status = interaction.options.getString('status');
      const blockerReason = interaction.options.getString('blockerreason');

      const result = await this.taskService.updateTask(
        taskId,
        status as any,
        blockerReason || undefined,
      );

      // Log audit
      await this.auditService.logAction(
        interaction.guildId!,
        interaction.user.id,
        'task_update',
        'task',
        taskId,
        { status, blockerReason },
      );

      const embed = new EmbedBuilder()
        .setTitle('✅ Task Updated')
        .setColor(0x00ff00)
        .addFields({ name: 'Status', value: result.status, inline: true })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const message = handleError(error, this.logger);
      await interaction.editReply({ content: `❌ ${message}` });
    }
  }

  /**
   * Handle /task mylist
   */
  async handleMyList(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guildId!;
      const userId = interaction.user.id;

      const tasks = await this.taskService.getTasks(guildId, { assigneeId: userId });

      if (tasks.length === 0) {
        await interaction.editReply({ content: '📝 No tasks assigned to you.' });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('📋 Your Tasks')
        .setColor(0x0099ff)
        .setDescription(
          tasks
            .slice(0, 10)
            .map(
              (t) =>
                `**${t.title}** - ${t.status} ${t.dueDate ? `(Due: ${t.dueDate.toLocaleDateString()})` : ''}`,
            )
            .join('\n'),
        )
        .setFooter({ text: `Showing ${Math.min(tasks.length, 10)} of ${tasks.length} tasks` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const message = handleError(error, this.logger);
      await interaction.editReply({ content: `❌ ${message}` });
    }
  }

  /**
   * Handle /task teamlist
   */
  async handleTeamList(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: false });

      const guildId = interaction.guildId!;

      const tasks = await this.taskService.getTasks(guildId);

      if (tasks.length === 0) {
        await interaction.editReply({ content: '📝 No tasks found.' });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('📋 Team Tasks')
        .setColor(0x0099ff)
        .setDescription(
          tasks
            .slice(0, 15)
            .map(
              (t) =>
                `**${t.title}** - Assigned to <@${t.assigneeId}> - ${t.status}`,
            )
            .join('\n'),
        )
        .setFooter({ text: `Showing ${Math.min(tasks.length, 15)} of ${tasks.length} tasks` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const message = handleError(error, this.logger);
      await interaction.editReply({ content: `❌ ${message}` });
    }
  }
}
