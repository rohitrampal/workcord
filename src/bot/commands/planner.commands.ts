import { SlashCommandBuilder, EmbedBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { PlannerService } from '@domain/planner/planner.service';
import { AuditService } from '@domain/audit/audit.service';
import { handleError } from '@shared/utils/errors';
import { Logger } from '@nestjs/common';
import { formatISTDate } from '@shared/utils/date';

/**
 * Planner Commands
 * Commands for sprint and OKR management
 */
export class PlannerCommands {
  private readonly logger = new Logger(PlannerCommands.name);

  constructor(
    private plannerService: PlannerService,
    private auditService: AuditService,
  ) {}

  /**
   * Register planner commands
   */
  static getCommands(): SlashCommandBuilder[] {
    return [
      new SlashCommandBuilder()
        .setName('sprint')
        .setDescription('Sprint management commands')
        .addSubcommand((subcommand) =>
          subcommand
            .setName('create')
            .setDescription('Create a new sprint')
            .addStringOption((option) =>
              option.setName('name').setDescription('Sprint name').setRequired(true),
            )
            .addStringOption((option) =>
              option.setName('startdate').setDescription('Start date (YYYY-MM-DD)').setRequired(true),
            )
            .addStringOption((option) =>
              option.setName('enddate').setDescription('End date (YYYY-MM-DD)').setRequired(true),
            )
            .addStringOption((option) =>
              option.setName('goals').setDescription('Sprint goals (comma-separated)').setRequired(false),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('status')
            .setDescription('View sprint status')
            .addStringOption((option) =>
              option.setName('id').setDescription('Sprint ID (leave empty for active sprint)').setRequired(false),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('assign')
            .setDescription('Assign a task to sprint')
            .addStringOption((option) =>
              option.setName('sprintid').setDescription('Sprint ID').setRequired(true),
            )
            .addStringOption((option) =>
              option.setName('taskid').setDescription('Task ID').setRequired(true),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('complete')
            .setDescription('Mark sprint as completed')
            .addStringOption((option) =>
              option.setName('id').setDescription('Sprint ID').setRequired(true),
            ),
        ) as SlashCommandBuilder,
      new SlashCommandBuilder()
        .setName('goal')
        .setDescription('OKR goal management commands')
        .addSubcommand((subcommand) =>
          subcommand
            .setName('set')
            .setDescription('Set an OKR goal')
            .addStringOption((option) =>
              option.setName('objective').setDescription('Objective').setRequired(true),
            )
            .addStringOption((option) =>
              option
                .setName('keyresults')
                .setDescription('Key results (comma-separated, max 5)')
                .setRequired(true),
            )
            .addStringOption((option) =>
              option.setName('duedate').setDescription('Due date (YYYY-MM-DD)').setRequired(true),
            )
            .addStringOption((option) =>
              option.setName('description').setDescription('Goal description').setRequired(false),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('update')
            .setDescription('Update goal progress')
            .addStringOption((option) =>
              option.setName('id').setDescription('Goal ID').setRequired(true),
            )
            .addIntegerOption((option) =>
              option
                .setName('keyresult')
                .setDescription('Key result number (1, 2, 3...)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(5),
            )
            .addIntegerOption((option) =>
              option.setName('progress').setDescription('Progress percentage (0-100)').setRequired(true).setMinValue(0).setMaxValue(100),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand.setName('list').setDescription('List all active goals'),
        ) as SlashCommandBuilder,
    ];
  }

  /**
   * Handle /sprint create
   */
  async handleSprintCreate(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guildId!;
      const name = interaction.options.getString('name', true);
      const startDate = interaction.options.getString('startdate', true);
      const endDate = interaction.options.getString('enddate', true);
      const goalsStr = interaction.options.getString('goals');

      const goals = goalsStr ? goalsStr.split(',').map((g) => g.trim()).filter((g) => g.length > 0) : undefined;

      const sprint = await this.plannerService.createSprint(guildId, name, startDate, endDate, goals);

      await this.auditService.logAction(guildId, interaction.user.id, 'sprint_create', 'planner_plan', sprint.id, {
        name,
        startDate,
        endDate,
      });

      const embed = new EmbedBuilder()
        .setTitle('✅ Sprint Created')
        .setColor(0x00ff00)
        .addFields(
          { name: 'Sprint Name', value: name, inline: true },
          { name: 'Start Date', value: startDate, inline: true },
          { name: 'End Date', value: endDate, inline: true },
          { name: 'Sprint ID', value: sprint.id, inline: false },
        )
        .setTimestamp();

      if (goals && goals.length > 0) {
        embed.addFields({
          name: 'Goals',
          value: goals.map((g, i) => `${i + 1}. ${g}`).join('\n'),
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const message = handleError(error, this.logger);
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Sprint Creation Failed')
        .setDescription(message)
        .setColor(0xff0000)
        .setTimestamp();
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  /**
   * Handle /sprint status
   */
  async handleSprintStatus(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guildId!;
      const sprintId = interaction.options.getString('id');

      const status = await this.plannerService.getSprintStatus(guildId, sprintId || undefined);

      const embed = new EmbedBuilder()
        .setTitle(`📊 Sprint Status: ${status.name}`)
        .setColor(0x0099ff)
        .addFields(
          { name: 'Status', value: status.status, inline: true },
          { name: 'Progress', value: `${status.progress}%`, inline: true },
          { name: 'Velocity', value: `${status.velocity} tasks/day`, inline: true },
          {
            name: 'Timeline',
            value: `${status.timeline.daysElapsed}/${status.timeline.daysTotal} days (${status.timeline.daysRemaining} remaining)`,
            inline: false,
          },
          {
            name: 'Tasks',
            value: `✅ Completed: ${status.tasks.completed}\n🔄 In Progress: ${status.tasks.inProgress}\n⏳ Not Started: ${status.tasks.notStarted}\n📋 Total: ${status.tasks.total}`,
            inline: false,
          },
          {
            name: 'Date Range',
            value: `${formatISTDate(status.startDate)} to ${formatISTDate(status.endDate)}`,
            inline: false,
          },
        )
        .setTimestamp();

      if (status.goals.length > 0) {
        embed.addFields({
          name: 'Goals',
          value: status.goals.map((g: string, i: number) => `${i + 1}. ${g}`).join('\n'),
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const message = handleError(error, this.logger);
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Sprint Status Failed')
        .setDescription(message)
        .setColor(0xff0000)
        .setTimestamp();
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  /**
   * Handle /sprint assign
   */
  async handleSprintAssign(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guildId!;
      const sprintId = interaction.options.getString('sprintid', true);
      const taskId = interaction.options.getString('taskid', true);

      await this.plannerService.assignTaskToSprint(guildId, sprintId, taskId);

      await this.auditService.logAction(guildId, interaction.user.id, 'sprint_task_assign', 'planner_plan', sprintId, {
        taskId,
      });

      const embed = new EmbedBuilder()
        .setTitle('✅ Task Assigned to Sprint')
        .setDescription(`Task ${taskId} has been assigned to sprint ${sprintId}`)
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const message = handleError(error, this.logger);
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Task Assignment Failed')
        .setDescription(message)
        .setColor(0xff0000)
        .setTimestamp();
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  /**
   * Handle /sprint complete
   */
  async handleSprintComplete(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guildId!;
      const sprintId = interaction.options.getString('id', true);

      await this.plannerService.completeSprint(guildId, sprintId);

      await this.auditService.logAction(guildId, interaction.user.id, 'sprint_complete', 'planner_plan', sprintId, {});

      const embed = new EmbedBuilder()
        .setTitle('✅ Sprint Completed')
        .setDescription(`Sprint ${sprintId} has been marked as completed`)
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const message = handleError(error, this.logger);
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Sprint Completion Failed')
        .setDescription(message)
        .setColor(0xff0000)
        .setTimestamp();
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  /**
   * Handle /goal set
   */
  async handleGoalSet(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guildId!;
      const objective = interaction.options.getString('objective', true);
      const keyResultsStr = interaction.options.getString('keyresults', true);
      const dueDate = interaction.options.getString('duedate', true);
      const description = interaction.options.getString('description');

      const keyResults = keyResultsStr
        .split(',')
        .map((kr) => kr.trim())
        .filter((kr) => kr.length > 0)
        .slice(0, 5); // Max 5 key results

      if (keyResults.length === 0) {
        await interaction.editReply({
          content: '❌ At least one key result is required.',
        });
        return;
      }

      const goal = await this.plannerService.createGoal(guildId, objective, keyResults, dueDate, description || undefined);

      await this.auditService.logAction(guildId, interaction.user.id, 'goal_set', 'planner_plan', goal.id, {
        objective,
        keyResultsCount: keyResults.length,
        dueDate,
      });

      const embed = new EmbedBuilder()
        .setTitle('✅ OKR Goal Set')
        .setColor(0x00ff00)
        .addFields(
          { name: 'Objective', value: objective, inline: false },
          {
            name: 'Key Results',
            value: keyResults.map((kr, i) => `${i + 1}. ${kr}`).join('\n'),
            inline: false,
          },
          { name: 'Due Date', value: dueDate, inline: true },
          { name: 'Goal ID', value: goal.id, inline: true },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const message = handleError(error, this.logger);
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Goal Setting Failed')
        .setDescription(message)
        .setColor(0xff0000)
        .setTimestamp();
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  /**
   * Handle /goal update
   */
  async handleGoalUpdate(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guildId!;
      const goalId = interaction.options.getString('id', true);
      const keyResultId = interaction.options.getInteger('keyresult', true);
      const progress = interaction.options.getInteger('progress', true);

      await this.plannerService.updateGoalProgress(guildId, goalId, keyResultId, progress);

      await this.auditService.logAction(guildId, interaction.user.id, 'goal_update', 'planner_plan', goalId, {
        keyResultId,
        progress,
      });

      const embed = new EmbedBuilder()
        .setTitle('✅ Goal Progress Updated')
        .setDescription(`Key Result ${keyResultId} progress set to ${progress}%`)
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const message = handleError(error, this.logger);
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Goal Update Failed')
        .setDescription(message)
        .setColor(0xff0000)
        .setTimestamp();
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  /**
   * Handle /goal list
   */
  async handleGoalList(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guildId!;

      const goals = await this.plannerService.getActivePlans(guildId, 'okr');

      if (goals.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle('📋 Active Goals')
          .setDescription('No active goals found.')
          .setColor(0x0099ff)
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('📋 Active Goals')
        .setColor(0x0099ff)
        .setTimestamp();

      for (const goal of goals.slice(0, 10)) {
        const metadata = (goal.metadata as any) || {};
        const overallProgress = metadata.overallProgress || 0;
        embed.addFields({
          name: goal.name,
          value: `**Progress:** ${overallProgress}%\n**Due:** ${formatISTDate(goal.endDate)}\n**ID:** ${goal.id}`,
          inline: true,
        });
      }

      if (goals.length > 10) {
        embed.setFooter({ text: `Showing 10 of ${goals.length} goals` });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const message = handleError(error, this.logger);
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Goal List Failed')
        .setDescription(message)
        .setColor(0xff0000)
        .setTimestamp();
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
}
