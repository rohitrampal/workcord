import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DiscordService } from '@infra/discord/discord.service';
import { ProvisioningService } from '@domain/provisioning/provisioning.service';
import { ConciergeService } from '@domain/concierge/concierge.service';
import { AttendanceCommands } from './commands/attendance.commands';
import { LeaveCommands } from './commands/leave.commands';
import { TaskCommands } from './commands/task.commands';
import { ConciergeCommands } from './commands/concierge.commands';
import { AttendanceService } from '@domain/hrms/attendance.service';
import { LeaveService } from '@domain/hrms/leave.service';
import { TaskService } from '@domain/tasks/task.service';
import { AuditService } from '@domain/audit/audit.service';
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

  constructor(
    private discord: DiscordService,
    private provisioningService: ProvisioningService,
    private conciergeService: ConciergeService,
    private attendanceService: AttendanceService,
    private leaveService: LeaveService,
    private taskService: TaskService,
    private auditService: AuditService,
  ) {
    // Initialize command handlers
    this.attendanceCommands = new AttendanceCommands(
      attendanceService,
      auditService,
      discord,
    );
    this.leaveCommands = new LeaveCommands(leaveService, auditService);
    this.taskCommands = new TaskCommands(taskService, auditService);
    this.conciergeCommands = new ConciergeCommands(conciergeService);
  }

  async onModuleInit() {
    // Register all commands
    const allCommands = [
      ...AttendanceCommands.getCommands(),
      ...LeaveCommands.getCommands(),
      ...TaskCommands.getCommands(),
      ...ConciergeCommands.getCommands(),
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
}
