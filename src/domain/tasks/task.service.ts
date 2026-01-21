import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@infra/database/prisma.service';
import { NotFoundError, ConflictError } from '@shared/utils/errors';
import { parseISTDate } from '@shared/utils/date';
import { TaskStatus, TaskPriority } from '@shared/types';

/**
 * Task Service
 * Handles task creation, assignment, and tracking
 */
@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Create a new task
   */
  async createTask(
    guildId: string,
    creatorId: string,
    title: string,
    assigneeId: string,
    description?: string,
    dueDate?: string,
    priority?: TaskPriority,
    channelId?: string,
  ): Promise<{ id: string; title: string; status: string }> {
    const task = await this.prisma.task.create({
      data: {
        guildId,
        creatorId,
        assigneeId,
        title,
        description: description || null,
        dueDate: dueDate ? parseISTDate(dueDate) : null,
        priority: priority || TaskPriority.NORMAL,
        channelId: channelId || null,
        status: TaskStatus.NOT_STARTED,
      },
    });

    this.logger.log(`Task created: ${task.id} by ${creatorId} in guild ${guildId}`);

    return {
      id: task.id,
      title: task.title,
      status: task.status,
    };
  }

  /**
   * Update task status
   */
  async updateTask(
    taskId: string,
    status?: TaskStatus,
    blockerReason?: string,
  ): Promise<{ id: string; status: string }> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new NotFoundError('Task');
    }

    const updateData: any = {};
    if (status) {
      updateData.status = status;
      if (status === TaskStatus.COMPLETED) {
        updateData.completedAt = new Date();
      }
    }
    if (blockerReason) {
      updateData.blockerReason = blockerReason;
      if (!status) {
        updateData.status = TaskStatus.BLOCKED;
      }
    }

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: updateData,
    });

    this.logger.log(`Task ${taskId} updated to status ${updated.status}`);

    return {
      id: updated.id,
      status: updated.status,
    };
  }

  /**
   * Get tasks with filters
   */
  async getTasks(
    guildId: string,
    filters?: {
      assigneeId?: string;
      creatorId?: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      overdue?: boolean;
    },
  ) {
    const where: any = { guildId };

    if (filters?.assigneeId) where.assigneeId = filters.assigneeId;
    if (filters?.creatorId) where.creatorId = filters.creatorId;
    if (filters?.status) where.status = filters.status;
    if (filters?.priority) where.priority = filters.priority;
    if (filters?.overdue) {
      where.dueDate = { lt: new Date() };
      where.status = { not: TaskStatus.COMPLETED };
    }

    return this.prisma.task.findMany({
      where,
      include: {
        assignee: {
          select: {
            id: true,
            username: true,
          },
        },
        creator: {
          select: {
            id: true,
            username: true,
          },
        },
        channel: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [
        { priority: 'desc' },
        { dueDate: 'asc' },
        { createdAt: 'desc' },
      ],
    });
  }

  /**
   * Get task by ID
   */
  async getTaskById(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignee: {
          select: {
            id: true,
            username: true,
          },
        },
        creator: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    if (!task) {
      throw new NotFoundError('Task');
    }

    return task;
  }

  /**
   * Get overdue tasks
   */
  async getOverdueTasks(guildId: string) {
    return this.getTasks(guildId, { overdue: true });
  }

  /**
   * Calculate task completion rate
   */
  async getCompletionRate(guildId: string, startDate?: Date, endDate?: Date): Promise<number> {
    const where: any = {
      guildId,
    };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [total, completed] = await Promise.all([
      this.prisma.task.count({ where }),
      this.prisma.task.count({
        where: {
          ...where,
          status: TaskStatus.COMPLETED,
        },
      }),
    ]);

    return total > 0 ? (completed / total) * 100 : 0;
  }
}
