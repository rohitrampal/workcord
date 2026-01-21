import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@infra/database/prisma.service';
import { AttendanceService } from '@domain/hrms/attendance.service';
import { LeaveService } from '@domain/hrms/leave.service';
import { TaskService } from '@domain/tasks/task.service';
import { TodoService } from '@domain/wfm/todo.service';
import { UpdateService } from '@domain/wfm/update.service';
import { stringify } from 'csv-stringify/sync';

/**
 * Reporting Service
 * Generates reports and analytics
 */
@Injectable()
export class ReportingService {
  private readonly logger = new Logger(ReportingService.name);

  constructor(
    private prisma: PrismaService,
    private attendanceService: AttendanceService,
    private leaveService: LeaveService,
    private taskService: TaskService,
    private todoService: TodoService,
    private updateService: UpdateService,
  ) {}

  /**
   * Generate attendance report
   */
  async generateAttendanceReport(
    guildId: string,
    type: 'daily' | 'weekly' | 'monthly' | 'custom',
    startDate?: Date,
    endDate?: Date,
    userId?: string,
  ) {
    let start: Date;
    let end: Date;

    const now = new Date();
    switch (type) {
      case 'daily':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        break;
      case 'weekly':
        const dayOfWeek = now.getDay();
        start = new Date(now);
        start.setDate(now.getDate() - dayOfWeek);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        break;
      case 'monthly':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'custom':
        start = startDate || new Date();
        end = endDate || new Date();
        break;
    }

    const attendance = await this.attendanceService.getAttendance(guildId, userId, start, end);

    return {
      type,
      startDate: start,
      endDate: end,
      records: attendance,
      summary: {
        totalRecords: attendance.length,
        presentDays: attendance.filter((a) => a.checkInAt && a.checkOutAt).length,
        averageHours: this.calculateAverageHours(attendance),
      },
    };
  }

  /**
   * Generate leave report
   */
  async generateLeaveReport(
    guildId: string,
    status?: 'Pending' | 'Approved' | 'Rejected' | 'All',
    startDate?: Date,
    endDate?: Date,
  ) {
    const leaves = await this.leaveService.getLeaves(guildId, {
      status: status === 'All' ? undefined : (status as any),
      startDate,
      endDate,
    });

    return {
      status: status || 'All',
      records: leaves,
      summary: {
        total: leaves.length,
        pending: leaves.filter((l) => l.status === 'Pending').length,
        approved: leaves.filter((l) => l.status === 'Approved').length,
        rejected: leaves.filter((l) => l.status === 'Rejected').length,
      },
    };
  }

  /**
   * Generate task report
   */
  async generateTaskReport(
    guildId: string,
    type: 'status' | 'assignee' | 'overdue' | 'completed',
    filter?: string,
  ) {
    let tasks;
    switch (type) {
      case 'status':
        tasks = await this.taskService.getTasks(guildId, {
          status: filter as any,
        });
        break;
      case 'assignee':
        tasks = await this.taskService.getTasks(guildId, {
          assigneeId: filter,
        });
        break;
      case 'overdue':
        tasks = await this.taskService.getOverdueTasks(guildId);
        break;
      case 'completed':
        tasks = await this.taskService.getTasks(guildId, {
          status: 'Completed' as any,
        });
        break;
      default:
        tasks = await this.taskService.getTasks(guildId);
    }

    const completionRate = await this.taskService.getCompletionRate(guildId);

    return {
      type,
      records: tasks,
      summary: {
        total: tasks.length,
        completionRate: Math.round(completionRate * 100) / 100,
        byStatus: this.groupByStatus(tasks),
        byPriority: this.groupByPriority(tasks),
      },
    };
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(guildId: string, startDate: Date, endDate: Date) {
    const channels = await this.prisma.channel.findMany({
      where: {
        guildId,
        isWfmEnabled: true,
      },
    });

    const compliance = await Promise.all(
      channels.map(async (channel) => {
        const [todoCompliance, updateCompliance] = await Promise.all([
          this.todoService.getComplianceRate(guildId, channel.id, startDate, endDate),
          this.updateService.getComplianceRate(guildId, channel.id, startDate, endDate),
        ]);

        return {
          channelId: channel.id,
          channelName: channel.name,
          todoCompliance: Math.round(todoCompliance * 100) / 100,
          updateCompliance: Math.round(updateCompliance * 100) / 100,
        };
      }),
    );

    return {
      startDate,
      endDate,
      channels: compliance,
      average: {
        todo: compliance.reduce((sum, c) => sum + c.todoCompliance, 0) / compliance.length,
        update: compliance.reduce((sum, c) => sum + c.updateCompliance, 0) / compliance.length,
      },
    };
  }

  /**
   * Export report to CSV
   */
  exportToCSV(data: any[], headers: string[]): string {
    return stringify(data, {
      header: true,
      columns: headers,
    });
  }

  private calculateAverageHours(attendance: any[]): number {
    const withHours = attendance.filter((a) => a.hoursWorked);
    if (withHours.length === 0) return 0;
    const total = withHours.reduce((sum, a) => sum + (a.hoursWorked || 0), 0);
    return Math.round((total / withHours.length) * 100) / 100;
  }

  private groupByStatus(tasks: any[]): Record<string, number> {
    const grouped: Record<string, number> = {};
    for (const task of tasks) {
      grouped[task.status] = (grouped[task.status] || 0) + 1;
    }
    return grouped;
  }

  private groupByPriority(tasks: any[]): Record<string, number> {
    const grouped: Record<string, number> = {};
    for (const task of tasks) {
      grouped[task.priority] = (grouped[task.priority] || 0) + 1;
    }
    return grouped;
  }
}
