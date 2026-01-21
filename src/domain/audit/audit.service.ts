import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@infra/database/prisma.service';

/**
 * Audit Service
 * Logs all actions for compliance and governance
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Log an action to audit trail
   */
  async logAction(
    guildId: string,
    userId: string,
    action: string,
    entityType?: string,
    entityId?: string,
    details?: Record<string, any>,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          guildId,
          userId,
          action,
          entityType,
          entityId,
          details: details || {},
        },
      });
    } catch (error) {
      // Don't throw - audit logging should not break the main flow
      this.logger.error(`Failed to log audit action: ${action}`, error);
    }
  }

  /**
   * Get audit logs with filters
   */
  async getAuditLogs(
    guildId: string,
    filters?: {
      userId?: string;
      action?: string;
      entityType?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    },
  ) {
    const where: any = { guildId };

    if (filters?.userId) where.userId = filters.userId;
    if (filters?.action) where.action = filters.action;
    if (filters?.entityType) where.entityType = filters.entityType;
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    return this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters?.limit || 100,
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });
  }
}
