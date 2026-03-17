import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DiscordService } from '@infra/discord/discord.service';
import { ProvisioningService } from '@domain/provisioning/provisioning.service';
import { ConciergeService } from '@domain/concierge/concierge.service';
import { AttendanceCommands } from './commands/attendance.commands';
import { LeaveCommands } from './commands/leave.commands';
import { TaskCommands } from './commands/task.commands';
import { ConciergeCommands } from './commands/concierge.commands';
import { AdminCommands } from './commands/admin.commands';
import { ReportCommands } from './commands/report.commands';
import { PlannerCommands } from './commands/planner.commands';
import { AttendanceService } from '@domain/hrms/attendance.service';
import { LeaveService } from '@domain/hrms/leave.service';
import { TaskService } from '@domain/tasks/task.service';
import { AuditService } from '@domain/audit/audit.service';
import { TodoService } from '@domain/wfm/todo.service';
import { UpdateService } from '@domain/wfm/update.service';
import { ReportingService } from '@domain/reporting/reporting.service';
import { PlannerService } from '@domain/planner/planner.service';
import { HrTicketService } from '@domain/concierge/hr-ticket.service';
import { KnowledgeBaseService } from '@domain/concierge/knowledge-base.service';
import { PrismaService } from '@infra/database/prisma.service';
import { Events } from 'discord.js';

/**
 * Bot Service
 * Main service that coordinates Discord bot interactions
 */
@Injectable()
export class BotService implements OnModuleInit {
  private readonly logger = new Logger(BotService.name);
  private attendanceCommands: AttendanceCommands;
  private leaveCommands: LeaveCommands;
  private taskCommands: TaskCommands;
  private conciergeCommands: ConciergeCommands;
  private adminCommands: AdminCommands;
  private reportCommands: ReportCommands;
  private plannerCommands: PlannerCommands;

  constructor(
    private discord: DiscordService,
    private provisioningService: ProvisioningService,
    private conciergeService: ConciergeService,
    private attendanceService: AttendanceService,
    private leaveService: LeaveService,
    private taskService: TaskService,
    private auditService: AuditService,
    private todoService: TodoService,
    private updateService: UpdateService,
    private reportingService: ReportingService,
    private plannerService: PlannerService,
    private hrTicketService: HrTicketService,
    private knowledgeBaseService: KnowledgeBaseService,
    private prisma: PrismaService,
  ) {
    // Initialize command handlers
    this.attendanceCommands = new AttendanceCommands(
      attendanceService,
      auditService,
      discord,
    );
    this.leaveCommands = new LeaveCommands(leaveService, auditService, discord, prisma);
    this.taskCommands = new TaskCommands(taskService, auditService);
    this.conciergeCommands = new ConciergeCommands(
      conciergeService,
      hrTicketService,
      knowledgeBaseService,
      discord,
      prisma,
      auditService,
    );
    this.adminCommands = new AdminCommands(
      auditService,
      this.prisma,
      hrTicketService,
      knowledgeBaseService,
      discord,
    );
    this.reportCommands = new ReportCommands(this.reportingService);
    this.plannerCommands = new PlannerCommands(plannerService, auditService);
  }

  async onModuleInit() {
    // Register all commands
    const allCommands = [
      ...AttendanceCommands.getCommands(),
      ...LeaveCommands.getCommands(),
      ...TaskCommands.getCommands(),
      ...ConciergeCommands.getCommands(),
      ...AdminCommands.getCommands(),
      ...ReportCommands.getCommands(),
      ...PlannerCommands.getCommands(),
    ];

    await this.discord.registerCommands(allCommands);

    // Set up event listeners
    this.setupEventListeners();
    this.setupCommandHandlers();

    this.logger.log('Bot service initialized');
  }

  private setupEventListeners() {
    const client = this.discord.client;

    // Handle guild join (auto-provisioning)
    client.on(Events.GuildCreate, async (guild) => {
      this.logger.log(`Bot joined guild: ${guild.name} (${guild.id})`);
      try {
        await this.provisioningService.provisionGuild(guild.id);
      } catch (error) {
        this.logger.error(`Failed to provision guild ${guild.id}`, error);
      }
    });

    // Handle member join (create concierge channel)
    client.on(Events.GuildMemberAdd, async (member) => {
      this.logger.log(`Member joined: ${member.user.tag} in ${member.guild.name}`);
      try {
        await this.conciergeService.createConciergeChannel(member.guild.id, member.user.id);
      } catch (error) {
        this.logger.error(
          `Failed to create concierge channel for ${member.user.id}`,
          error,
        );
      }
    });

    // Handle interaction (slash commands)
    client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      // Route to appropriate command handler
      // This is handled in setupCommandHandlers
    });

    // Handle message creation (for To-Do and EOD parsing)
    client.on(Events.MessageCreate, async (message) => {
      // Ignore bot messages
      if (message.author.bot) return;

      // Only process messages in guild channels
      if (!message.guild || !message.channel.isTextBased()) return;

      try {
        await this.handleMessageParsing(message);
      } catch (error) {
        this.logger.error(`Error parsing message ${message.id}`, error);
      }
    });
  }

  private setupCommandHandlers() {
    const client = this.discord.client;

    client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      try {
        const commandName = interaction.commandName;

        // Attendance commands
        if (commandName === 'checkin') {
          await this.attendanceCommands.handleCheckIn(interaction);
        } else if (commandName === 'checkout') {
          await this.attendanceCommands.handleCheckOut(interaction);
        }
        // Leave commands
        else if (commandName === 'leave') {
          const subcommand = interaction.options.getSubcommand();
          if (subcommand === 'apply') {
            await this.leaveCommands.handleApply(interaction);
          } else if (subcommand === 'balance') {
            await this.leaveCommands.handleBalance(interaction);
          } else if (subcommand === 'approve') {
            await this.leaveCommands.handleApprove(interaction);
          } else if (subcommand === 'reject') {
            await this.leaveCommands.handleReject(interaction);
          } else if (subcommand === 'calendar') {
            await this.leaveCommands.handleCalendar(interaction);
          } else if (subcommand === 'history') {
            await this.leaveCommands.handleHistory(interaction);
          }
        }
        // Task commands
        else if (commandName === 'task') {
          const subcommand = interaction.options.getSubcommand();
          if (subcommand === 'create') {
            await this.taskCommands.handleCreate(interaction);
          } else if (subcommand === 'update') {
            await this.taskCommands.handleUpdate(interaction);
          } else if (subcommand === 'mylist') {
            await this.taskCommands.handleMyList(interaction);
          } else if (subcommand === 'teamlist') {
            await this.taskCommands.handleTeamList(interaction);
          }
        }
        // Concierge commands
        else if (commandName === 'mystats') {
          await this.conciergeCommands.handleMyStats(interaction);
        } else if (commandName === 'hrhelp') {
          await this.conciergeCommands.handleHrHelp(interaction);
        } else if (commandName === 'knowledgebase') {
          await this.conciergeCommands.handleKnowledgeBase(interaction);
        }
        // Admin commands
        else if (commandName === 'admin') {
          const subcommand = interaction.options.getSubcommand();
          if (subcommand === 'audit') {
            await this.adminCommands.handleAudit(interaction);
          } else if (subcommand === 'config') {
            await this.adminCommands.handleConfig(interaction);
          } else if (subcommand === 'penalties') {
            await this.adminCommands.handlePenalties(interaction);
          } else if (subcommand === 'bulk') {
            await this.adminCommands.handleBulk(interaction);
          } else if (subcommand === 'ticket') {
            await this.adminCommands.handleTicket(interaction);
          } else if (subcommand === 'kb') {
            await this.adminCommands.handleKnowledgeBase(interaction);
          }
        }
        // Report commands
        else if (commandName === 'report') {
          const subcommand = interaction.options.getSubcommand();
          if (subcommand === 'attendance') {
            await this.reportCommands.handleAttendance(interaction);
          } else if (subcommand === 'leave') {
            await this.reportCommands.handleLeave(interaction);
          } else if (subcommand === 'task') {
            await this.reportCommands.handleTask(interaction);
          } else if (subcommand === 'compliance') {
            await this.reportCommands.handleCompliance(interaction);
          }
        } else if (commandName === 'sprint') {
          const subcommand = interaction.options.getSubcommand();
          if (subcommand === 'create') {
            await this.plannerCommands.handleSprintCreate(interaction);
          } else if (subcommand === 'status') {
            await this.plannerCommands.handleSprintStatus(interaction);
          } else if (subcommand === 'assign') {
            await this.plannerCommands.handleSprintAssign(interaction);
          } else if (subcommand === 'complete') {
            await this.plannerCommands.handleSprintComplete(interaction);
          }
        } else if (commandName === 'goal') {
          const subcommand = interaction.options.getSubcommand();
          if (subcommand === 'set') {
            await this.plannerCommands.handleGoalSet(interaction);
          } else if (subcommand === 'update') {
            await this.plannerCommands.handleGoalUpdate(interaction);
          } else if (subcommand === 'list') {
            await this.plannerCommands.handleGoalList(interaction);
          }
        }
      } catch (error) {
        this.logger.error('Error handling interaction', error);
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: '❌ An error occurred while processing your command.',
            ephemeral: true,
          });
        }
      }
    });
  }

  /**
   * Parse messages for To-Do and EOD updates
   */
  private async handleMessageParsing(message: any): Promise<void> {
    const guildId = message.guild.id;
    const channelId = message.channel.id;
    const userId = message.author.id;
    const content = message.content.trim();

    // Check if channel is WFM-enabled
    const channel = await this.discord.client.guilds.cache
      .get(guildId)
      ?.channels.cache.get(channelId);

    if (!channel || !channel.isTextBased()) return;

    // Get channel from database
    const dbChannel = await this.prisma.channel.findUnique({
      where: { id: channelId },
    });

    if (!dbChannel || !dbChannel.isWfmEnabled) return;

    // Ensure user exists
    try {
      const user = await this.prisma.user.findUnique({
        where: { guildId_id: { guildId, id: userId } },
      });

      if (!user) {
        // User doesn't exist, skip (will be created on first command)
        return;
      }
    } catch (error) {
      this.logger.warn(`User ${userId} not found in guild ${guildId}, skipping message parse`);
      return;
    }

    // Check if message is a reply to a reminder (within last 2 hours)
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    const messageAge = Date.now() - message.createdTimestamp;

    // Only process messages within 2 hours of reminder (9:15 AM for To-Do, 6:00 PM for EOD)
    if (messageAge > 2 * 60 * 60 * 1000) return;

    // Try to parse as EOD update first (structured format)
    const eodMatch = this.parseEodUpdate(content);
    if (eodMatch) {
      await this.updateService.createUpdate(
        guildId,
        userId,
        channelId,
        eodMatch.completed,
        eodMatch.inProgress,
        eodMatch.blockers,
      );
      this.logger.log(`Parsed EOD update from user ${userId} in channel ${channelId}`);
      await this.auditService.logAction(guildId, userId, 'eod_update_posted', 'update', undefined, {
        channelId,
        hasCompleted: !!eodMatch.completed,
        hasInProgress: !!eodMatch.inProgress,
        hasBlockers: !!eodMatch.blockers,
      });
      return;
    }

    // Otherwise, treat as To-Do (simple text)
    if (content.length > 0 && content.length < 2000) {
      await this.todoService.createTodo(guildId, userId, channelId, content);
      this.logger.log(`Parsed To-Do from user ${userId} in channel ${channelId}`);
      await this.auditService.logAction(guildId, userId, 'todo_posted', 'todo', undefined, {
        channelId,
        contentLength: content.length,
      });
    }
  }

  /**
   * Parse EOD update from message content
   * Expected format:
   * Completed:
   * - Task 1
   * - Task 2
   *
   * In Progress:
   * - Task 3
   *
   * Blockers:
   * - Issue description
   */
  private parseEodUpdate(content: string): {
    completed?: string;
    inProgress?: string;
    blockers?: string;
  } | null {
    const lines = content.split('\n').map((l) => l.trim());
    const result: { completed?: string; inProgress?: string; blockers?: string } = {};

    let currentSection: 'completed' | 'inProgress' | 'blockers' | null = null;
    const sections: string[] = [];

    for (const line of lines) {
      const lowerLine = line.toLowerCase();

      if (lowerLine.startsWith('completed:') || lowerLine.startsWith('**completed:**')) {
        currentSection = 'completed';
        sections.length = 0;
        continue;
      } else if (
        lowerLine.startsWith('in progress:') ||
        lowerLine.startsWith('**in progress:**') ||
        lowerLine.startsWith('in-progress:')
      ) {
        if (currentSection) {
          result[currentSection] = sections.join('\n').trim();
        }
        currentSection = 'inProgress';
        sections.length = 0;
        continue;
      } else if (lowerLine.startsWith('blockers:') || lowerLine.startsWith('**blockers:**')) {
        if (currentSection) {
          result[currentSection] = sections.join('\n').trim();
        }
        currentSection = 'blockers';
        sections.length = 0;
        continue;
      }

      if (currentSection && line.length > 0) {
        sections.push(line);
      }
    }

    // Add last section
    if (currentSection && sections.length > 0) {
      result[currentSection] = sections.join('\n').trim();
    }

    // Return result if at least one section was found
    return Object.keys(result).length > 0 ? result : null;
  }
}
