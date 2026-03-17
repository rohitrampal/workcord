/**
 * Reporting Service Tests
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ReportingService } from '@domain/reporting/reporting.service';
import { PrismaService } from '@infra/database/prisma.service';
import { AttendanceService } from '@domain/hrms/attendance.service';
import { LeaveService } from '@domain/hrms/leave.service';
import { TaskService } from '@domain/tasks/task.service';
import { TodoService } from '@domain/wfm/todo.service';
import { UpdateService } from '@domain/wfm/update.service';
import { testPrisma, createTestGuild, createTestUser } from '../setup';

describe('ReportingService', () => {
  let service: ReportingService;
  let guildId: string;
  let userId: string;

  beforeAll(async () => {
    // Just set IDs, don't create records yet
    guildId = `test-guild-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    userId = `test-user-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  });

  beforeEach(async () => {
    // Ensure guild exists first - create if doesn't exist
    let existingGuild = await testPrisma.guild.findUnique({ where: { id: guildId } });
    if (!existingGuild) {
      try {
        await testPrisma.guild.create({
          data: {
            id: guildId,
            name: 'Test Guild',
            ownerId: 'test-owner-123',
            isProvisioned: true,
          },
        });
      } catch (error) {
        // If creation fails, check again - might have been created by another test
        existingGuild = await testPrisma.guild.findUnique({ where: { id: guildId } });
        if (!existingGuild) {
          throw error;
        }
      }
    }
    // Then ensure user exists - create if doesn't exist
    const existingUser = await testPrisma.user.findUnique({
      where: { guildId_id: { guildId, id: userId } },
    });
    if (!existingUser) {
      await testPrisma.user.create({
        data: {
          id: userId,
          guildId,
          username: 'testuser',
          discriminator: '0001',
        },
      });
    }

    const mockAttendanceService = {
      getAttendance: jest.fn().mockResolvedValue([]),
    };
    const mockLeaveService = {
      getLeaves: jest.fn().mockResolvedValue([]),
    };
    const mockTaskService = {
      getTasks: jest.fn().mockResolvedValue([]),
      getOverdueTasks: jest.fn().mockResolvedValue([
        {
          id: 'task-1',
          title: 'Overdue Task',
          status: 'Not Started',
          dueDate: new Date('2020-01-01'),
          assigneeId: userId,
          creatorId: userId,
        },
      ]),
      getCompletionRate: jest.fn().mockResolvedValue(0),
    };
    const mockTodoService = {
      getComplianceRate: jest.fn().mockResolvedValue(0),
    };
    const mockUpdateService = {
      getComplianceRate: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportingService,
        {
          provide: PrismaService,
          useValue: testPrisma,
        },
        {
          provide: AttendanceService,
          useValue: mockAttendanceService,
        },
        {
          provide: LeaveService,
          useValue: mockLeaveService,
        },
        {
          provide: TaskService,
          useValue: mockTaskService,
        },
        {
          provide: TodoService,
          useValue: mockTodoService,
        },
        {
          provide: UpdateService,
          useValue: mockUpdateService,
        },
      ],
    }).compile();

    service = module.get<ReportingService>(ReportingService);
  });

  afterEach(async () => {
    // Clean up test data after each test (but keep guild and users)
    await testPrisma.attendance.deleteMany({ where: { guildId } });
    await testPrisma.leave.deleteMany({ where: { guildId } });
    await testPrisma.task.deleteMany({ where: { guildId } });
  });

  describe('generateAttendanceReport', () => {
    it('should generate daily attendance report', async () => {
      await testPrisma.attendance.create({
        data: {
          guildId,
          userId,
          date: new Date(),
          checkInAt: new Date(),
          checkOutAt: new Date(),
          location: 'Office',
          hoursWorked: 8,
        },
      });

      const report = await service.generateAttendanceReport(guildId, 'daily', new Date());

      expect(report).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(report.records).toBeDefined();
    });

    it('should generate weekly attendance report', async () => {
      const report = await service.generateAttendanceReport(guildId, 'weekly', new Date());

      expect(report).toBeDefined();
    });

    it('should generate monthly attendance report', async () => {
      const report = await service.generateAttendanceReport(guildId, 'monthly', new Date());

      expect(report).toBeDefined();
    });

    it('should generate custom range attendance report', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const report = await service.generateAttendanceReport(
        guildId,
        'custom',
        startDate,
        endDate,
      );

      expect(report).toBeDefined();
    });
  });

  describe('generateLeaveReport', () => {
    it('should generate leave report by status', async () => {
      // Ensure guild exists first
      const guild = await testPrisma.guild.findUnique({ where: { id: guildId } });
      if (!guild) {
        await testPrisma.guild.create({
          data: {
            id: guildId,
            name: 'Test Guild',
            ownerId: 'test-owner-123',
            isProvisioned: true,
          },
        });
      }
      // Then ensure user exists
      const user = await testPrisma.user.findUnique({
        where: { guildId_id: { guildId, id: userId } },
      });
      if (!user) {
        await testPrisma.user.create({
          data: {
            id: userId,
            guildId,
            username: 'testuser',
            discriminator: '0001',
          },
        });
      }

      await testPrisma.leave.create({
        data: {
          guildId,
          userId,
          leaveType: 'Sick Leave',
          startDate: new Date('2024-02-01'),
          endDate: new Date('2024-02-03'),
          reason: 'Sick',
          status: 'Pending',
        },
      });

      const report = await service.generateLeaveReport(guildId, 'Pending');

      expect(report).toBeDefined();
      expect(Array.isArray(report.records)).toBe(true);
    });
  });

  describe('generateTaskReport', () => {
    it('should generate task report by status', async () => {
      // Ensure guild exists first
      const guild = await testPrisma.guild.findUnique({ where: { id: guildId } });
      if (!guild) {
        await testPrisma.guild.create({
          data: {
            id: guildId,
            name: 'Test Guild',
            ownerId: 'test-owner-123',
            isProvisioned: true,
          },
        });
      }
      // Then ensure user exists
      const user = await testPrisma.user.findUnique({
        where: { guildId_id: { guildId, id: userId } },
      });
      if (!user) {
        await testPrisma.user.create({
          data: {
            id: userId,
            guildId,
            username: 'testuser',
            discriminator: '0001',
          },
        });
      }

      await testPrisma.task.create({
        data: {
          guildId,
          assigneeId: userId,
          creatorId: userId,
          title: 'Test Task',
          status: 'In Progress',
        },
      });

      const report = await service.generateTaskReport(guildId, 'status', 'In Progress');

      expect(report).toBeDefined();
    });

    it('should generate overdue task report', async () => {
      // Ensure guild exists first
      const guild = await testPrisma.guild.findUnique({ where: { id: guildId } });
      if (!guild) {
        await testPrisma.guild.create({
          data: {
            id: guildId,
            name: 'Test Guild',
            ownerId: 'test-owner-123',
            isProvisioned: true,
          },
        });
      }
      // Ensure user exists
      const user = await testPrisma.user.findUnique({
        where: { guildId_id: { guildId, id: userId } },
      });
      if (!user) {
        await testPrisma.user.create({
          data: {
            id: userId,
            guildId,
            username: 'testuser',
            discriminator: '0001',
          },
        });
      }

      await testPrisma.task.create({
        data: {
          guildId,
          assigneeId: userId,
          creatorId: userId,
          title: 'Overdue Task',
          status: 'Not Started',
          dueDate: new Date('2020-01-01'),
        },
      });

      const report = await service.generateTaskReport(guildId, 'overdue');

      expect(report).toBeDefined();
      expect(report.records.length).toBeGreaterThan(0);
    });
  });

  describe('generateComplianceReport', () => {
    it('should generate compliance report', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const report = await service.generateComplianceReport(guildId, startDate, endDate);

      expect(report).toBeDefined();
      expect(report.channels).toBeDefined();
      expect(report.average).toBeDefined();
      expect(report.average.todo).toBeDefined();
      expect(report.average.update).toBeDefined();
    });
  });

  describe('exportToCSV', () => {
    it('should export attendance report to CSV', async () => {
      const report = await service.generateAttendanceReport(guildId, 'daily', new Date());
      const csv = service.exportToCSV(report.records, ['id', 'userId', 'date', 'checkInAt', 'checkOutAt', 'hoursWorked']);

      expect(csv).toBeDefined();
      expect(typeof csv).toBe('string');
      expect(csv).toContain('id');
    });
  });
});
