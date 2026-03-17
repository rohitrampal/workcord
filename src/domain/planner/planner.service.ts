import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@infra/database/prisma.service';
import { ConflictError, NotFoundError } from '@shared/utils/errors';
import { parseISTDate, formatISTDate, getCurrentISTDate } from '@shared/utils/date';

/**
 * Planner Service
 * Handles sprint and OKR management
 */
@Injectable()
export class PlannerService {
  private readonly logger = new Logger(PlannerService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Create a sprint
   */
  async createSprint(
    guildId: string,
    name: string,
    startDate: string,
    endDate: string,
    goals?: string[],
    maxTasks: number = 20,
  ): Promise<{ id: string; name: string; status: string }> {
    const start = parseISTDate(startDate);
    const end = parseISTDate(endDate);

    if (end <= start) {
      throw new ConflictError('End date must be after start date');
    }

    // Check for active sprint (Free tier: 1 active sprint)
    const activeSprint = await this.prisma.plannerPlan.findFirst({
      where: {
        guildId,
        type: 'sprint',
        status: 'Active',
      },
    });

    if (activeSprint) {
      throw new ConflictError('An active sprint already exists. Complete or cancel it before creating a new one.');
    }

    const sprint = await this.prisma.plannerPlan.create({
      data: {
        guildId,
        type: 'sprint',
        name,
        description: goals?.join('\n') || null,
        startDate: start,
        endDate: end,
        status: 'Active',
        metadata: {
          goals: goals || [],
          maxTasks,
          tasks: [],
          completedTasks: 0,
          totalTasks: 0,
        },
      },
    });

    this.logger.log(`Sprint created: ${sprint.id} (${name}) in guild ${guildId}`);

    return {
      id: sprint.id,
      name: sprint.name,
      status: sprint.status,
    };
  }

  /**
   * Get sprint status
   */
  async getSprintStatus(guildId: string, sprintId?: string) {
    let sprint;

    if (sprintId) {
      sprint = await this.prisma.plannerPlan.findFirst({
        where: {
          id: sprintId,
          guildId,
          type: 'sprint',
        },
      });
    } else {
      sprint = await this.prisma.plannerPlan.findFirst({
        where: {
          guildId,
          type: 'sprint',
          status: 'Active',
        },
      });
    }

    if (!sprint) {
      throw new NotFoundError('Sprint');
    }

    const metadata = (sprint.metadata as any) || {};
    const tasks = metadata.tasks || [];
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t: any) => t.status === 'Completed').length;
    const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    // Calculate days elapsed and remaining
    const now = getCurrentISTDate();
    const daysElapsed = Math.ceil((now.getTime() - sprint.startDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysTotal = Math.ceil((sprint.endDate.getTime() - sprint.startDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(0, daysTotal - daysElapsed);

    // Calculate velocity (tasks completed per day)
    const velocity = daysElapsed > 0 ? completedTasks / daysElapsed : 0;

    return {
      id: sprint.id,
      name: sprint.name,
      status: sprint.status,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      progress: Math.round(progress * 100) / 100,
      tasks: {
        total: totalTasks,
        completed: completedTasks,
        inProgress: tasks.filter((t: any) => t.status === 'In Progress').length,
        notStarted: tasks.filter((t: any) => t.status === 'Not Started').length,
      },
      timeline: {
        daysElapsed,
        daysTotal,
        daysRemaining,
      },
      velocity: Math.round(velocity * 100) / 100,
      goals: metadata.goals || [],
    };
  }

  /**
   * Assign task to sprint
   */
  async assignTaskToSprint(guildId: string, sprintId: string, taskId: string): Promise<void> {
    const sprint = await this.prisma.plannerPlan.findFirst({
      where: {
        id: sprintId,
        guildId,
        type: 'sprint',
      },
    });

    if (!sprint) {
      throw new NotFoundError('Sprint');
    }

    if (sprint.status !== 'Active') {
      throw new ConflictError('Cannot assign tasks to inactive sprint');
    }

    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task || task.guildId !== guildId) {
      throw new NotFoundError('Task');
    }

    const metadata = (sprint.metadata as any) || {};
    const tasks = metadata.tasks || [];
    const maxTasks = metadata.maxTasks || 20;

    if (tasks.length >= maxTasks) {
      throw new ConflictError(`Sprint has reached maximum task limit (${maxTasks})`);
    }

    // Check if task already assigned
    if (tasks.some((t: any) => t.id === taskId)) {
      throw new ConflictError('Task is already assigned to this sprint');
    }

    // Add task to sprint
    tasks.push({
      id: taskId,
      title: task.title,
      status: task.status,
      assigneeId: task.assigneeId,
    });

    await this.prisma.plannerPlan.update({
      where: { id: sprintId },
      data: {
        metadata: {
          ...metadata,
          tasks,
          totalTasks: tasks.length,
        },
      },
    });

    this.logger.log(`Task ${taskId} assigned to sprint ${sprintId}`);
  }

  /**
   * Create OKR goal
   */
  async createGoal(
    guildId: string,
    objective: string,
    keyResults: string[],
    dueDate: string,
    description?: string,
  ): Promise<{ id: string; objective: string; status: string }> {
    const due = parseISTDate(dueDate);
    const now = getCurrentISTDate();

    if (due <= now) {
      throw new ConflictError('Due date must be in the future');
    }

    if (keyResults.length === 0) {
      throw new ConflictError('At least one key result is required');
    }

    const goal = await this.prisma.plannerPlan.create({
      data: {
        guildId,
        type: 'okr',
        name: objective,
        description: description || null,
        startDate: now,
        endDate: due,
        status: 'Active',
        metadata: {
          objective,
          keyResults: keyResults.map((kr, index) => ({
            id: index + 1,
            description: kr,
            progress: 0,
            completed: false,
          })),
          overallProgress: 0,
        },
      },
    });

    this.logger.log(`OKR goal created: ${goal.id} (${objective}) in guild ${guildId}`);

    return {
      id: goal.id,
      objective: goal.name,
      status: goal.status,
    };
  }

  /**
   * Update goal progress
   */
  async updateGoalProgress(
    guildId: string,
    goalId: string,
    keyResultId: number,
    progress: number,
  ): Promise<void> {
    if (progress < 0 || progress > 100) {
      throw new ConflictError('Progress must be between 0 and 100');
    }

    const goal = await this.prisma.plannerPlan.findFirst({
      where: {
        id: goalId,
        guildId,
        type: 'okr',
      },
    });

    if (!goal) {
      throw new NotFoundError('Goal');
    }

    const metadata = (goal.metadata as any) || {};
    const keyResults = metadata.keyResults || [];

    if (keyResultId < 1 || keyResultId > keyResults.length) {
      throw new NotFoundError('Key result');
    }

    // Update key result progress
    keyResults[keyResultId - 1].progress = progress;
    keyResults[keyResultId - 1].completed = progress >= 100;

    // Calculate overall progress
    const overallProgress = keyResults.reduce((sum: number, kr: any) => sum + kr.progress, 0) / keyResults.length;

    await this.prisma.plannerPlan.update({
      where: { id: goalId },
      data: {
        metadata: {
          ...metadata,
          keyResults,
          overallProgress: Math.round(overallProgress * 100) / 100,
        },
      },
    });

    this.logger.log(`Goal ${goalId} progress updated: Key Result ${keyResultId} = ${progress}%`);
  }

  /**
   * Get all active plans (sprints and goals)
   */
  async getActivePlans(guildId: string, type?: 'sprint' | 'okr') {
    const where: any = {
      guildId,
      status: 'Active',
    };

    if (type) {
      where.type = type;
    }

    return this.prisma.plannerPlan.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Complete sprint
   */
  async completeSprint(guildId: string, sprintId: string): Promise<void> {
    const sprint = await this.prisma.plannerPlan.findFirst({
      where: {
        id: sprintId,
        guildId,
        type: 'sprint',
      },
    });

    if (!sprint) {
      throw new NotFoundError('Sprint');
    }

    await this.prisma.plannerPlan.update({
      where: { id: sprintId },
      data: { status: 'Completed' },
    });

    this.logger.log(`Sprint ${sprintId} marked as completed`);
  }
}
