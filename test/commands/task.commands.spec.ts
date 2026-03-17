/**
 * Task Commands Tests
 */

import { TaskCommands } from '@bot/commands/task.commands';
import { TaskService } from '@domain/tasks/task.service';
import { AuditService } from '@domain/audit/audit.service';
import { ChatInputCommandInteraction } from 'discord.js';

describe('TaskCommands', () => {
  let commands: TaskCommands;
  let mockTaskService: jest.Mocked<TaskService>;
  let mockAuditService: jest.Mocked<AuditService>;
  let mockInteraction: Partial<ChatInputCommandInteraction>;

  beforeEach(() => {
    mockTaskService = {
      createTask: jest.fn(),
      updateTask: jest.fn(),
      getTasks: jest.fn(),
    } as any;

    mockAuditService = {
      logAction: jest.fn(),
    } as any;

    commands = new TaskCommands(mockTaskService, mockAuditService);

    mockInteraction = {
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
      guildId: 'test-guild',
      user: { id: 'test-user' },
      options: {
        getSubcommand: jest.fn(),
        getString: jest.fn(),
        getUser: jest.fn(),
      },
    } as any;
  });

  describe('getCommands', () => {
    it('should return task command with subcommands', () => {
      const commandsList = TaskCommands.getCommands();

      expect(commandsList.length).toBe(1);
      expect(commandsList[0].name).toBe('task');
    });
  });

  describe('handleCreate', () => {
    it('should handle task creation', async () => {
      (mockInteraction.options?.getSubcommand as jest.Mock).mockReturnValue('create');
      (mockInteraction.options?.getString as jest.Mock).mockImplementation((name: string) => {
        if (name === 'title') return 'Test Task';
        if (name === 'description') return 'Description';
        if (name === 'duedate') return '2024-12-31';
        if (name === 'priority') return 'High';
        return null;
      });
      (mockInteraction.options?.getUser as jest.Mock).mockReturnValue({ id: 'assignee-1' });

      mockTaskService.createTask.mockResolvedValue({
        id: 'task-1',
        title: 'Test Task',
        status: 'Not Started',
      });

      await commands.handleCreate(mockInteraction as ChatInputCommandInteraction);

      expect(mockTaskService.createTask).toHaveBeenCalled();
    });
  });
});
