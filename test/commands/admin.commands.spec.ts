/**
 * Admin Commands Tests
 */

import { AdminCommands } from '@bot/commands/admin.commands';
import { AuditService } from '@domain/audit/audit.service';
import { HrTicketService } from '@domain/concierge/hr-ticket.service';
import { KnowledgeBaseService } from '@domain/concierge/knowledge-base.service';
import { PrismaService } from '@infra/database/prisma.service';
import { DiscordService } from '@infra/discord/discord.service';
import { ChatInputCommandInteraction } from 'discord.js';

describe('AdminCommands', () => {
  let commands: AdminCommands;
  let mockAuditService: jest.Mocked<AuditService>;
  let mockPrismaService: jest.Mocked<PrismaService>;
  let mockHrTicketService: jest.Mocked<HrTicketService>;
  let mockKnowledgeBaseService: jest.Mocked<KnowledgeBaseService>;
  let mockDiscordService: jest.Mocked<DiscordService>;
  let mockInteraction: Partial<ChatInputCommandInteraction>;

  beforeEach(() => {
    mockAuditService = {
      getAuditLogs: jest.fn(),
    } as any;

    mockPrismaService = {
      guild: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      channel: {
        findFirst: jest.fn(),
      },
    } as any;

    mockHrTicketService = {
      listTickets: jest.fn(),
      getTicket: jest.fn(),
      respondToTicket: jest.fn(),
      updateTicketStatus: jest.fn(),
    } as any;

    mockKnowledgeBaseService = {
      createArticle: jest.fn(),
      updateArticle: jest.fn(),
      deleteArticle: jest.fn(),
      listArticles: jest.fn(),
    } as any;

    mockDiscordService = {
      getTextChannel: jest.fn(),
    } as any;

    commands = new AdminCommands(
      mockAuditService,
      mockPrismaService,
      mockHrTicketService,
      mockKnowledgeBaseService,
      mockDiscordService,
    );

    mockInteraction = {
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
      guildId: 'test-guild',
      user: { id: 'admin-user', tag: 'admin#0001' },
      options: {
        getSubcommand: jest.fn(),
        getString: jest.fn(),
        getUser: jest.fn(),
        getInteger: jest.fn(),
      },
    } as any;
  });

  describe('getCommands', () => {
    it('should return admin command with all subcommands', () => {
      const commandsList = AdminCommands.getCommands();

      expect(commandsList.length).toBe(1);
      expect(commandsList[0].name).toBe('admin');
    });
  });

  describe('handleAudit', () => {
    it('should handle audit log query', async () => {
      (mockInteraction.options?.getSubcommand as jest.Mock).mockReturnValue('audit');
      mockAuditService.getAuditLogs.mockResolvedValue([]);

      await commands.handleAudit(mockInteraction as ChatInputCommandInteraction);

      expect(mockAuditService.getAuditLogs).toHaveBeenCalled();
    });
  });

  describe('handleConfig', () => {
    it('should handle config view', async () => {
      (mockInteraction.options?.getSubcommand as jest.Mock).mockReturnValue('config');
      (mockInteraction.options?.getString as jest.Mock).mockReturnValue(null);

      (mockPrismaService.guild.findUnique as jest.Mock).mockResolvedValue({
        id: 'test-guild',
        reminderTimes: { todoReminder: '09:15', eodReminder: '18:00' },
      } as any);

      await commands.handleConfig(mockInteraction as ChatInputCommandInteraction);

      expect(mockPrismaService.guild.findUnique).toHaveBeenCalled();
    });
  });
});
