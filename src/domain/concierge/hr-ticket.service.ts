import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@infra/database/prisma.service';
import { NotFoundError, ConflictError } from '@shared/utils/errors';

/**
 * HR Ticket Service
 * Handles HR help desk ticket management
 */
@Injectable()
export class HrTicketService {
  private readonly logger = new Logger(HrTicketService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Create a new HR ticket
   */
  async createTicket(
    guildId: string,
    userId: string,
    category: string,
    question: string,
  ): Promise<{ ticketId: string; status: string }> {
    const ticket = await this.prisma.hrTicket.create({
      data: {
        guildId,
        userId,
        category,
        question,
        status: 'Open',
      },
    });

    this.logger.log(`HR ticket created: ${ticket.ticketId} by user ${userId} in guild ${guildId}`);

    return {
      ticketId: ticket.ticketId,
      status: ticket.status,
    };
  }

  /**
   * Get ticket by ID
   */
  async getTicket(guildId: string, ticketId: string) {
    const ticket = await this.prisma.hrTicket.findUnique({
      where: { ticketId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundError('Ticket');
    }

    if (ticket.guildId !== guildId) {
      throw new NotFoundError('Ticket');
    }

    return ticket;
  }

  /**
   * Get tickets with filters
   */
  async getTickets(
    guildId: string,
    filters?: {
      userId?: string;
      status?: string;
      category?: string;
      assignedTo?: string;
    },
  ) {
    const where: any = { guildId };

    if (filters?.userId) where.userId = filters.userId;
    if (filters?.status) where.status = filters.status;
    if (filters?.category) where.category = filters.category;
    if (filters?.assignedTo) where.assignedTo = filters.assignedTo;

    return this.prisma.hrTicket.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Respond to a ticket
   */
  async respondToTicket(
    guildId: string,
    ticketId: string,
    respondedBy: string,
    response: string,
  ): Promise<{ ticketId: string; status: string }> {
    const ticket = await this.getTicket(guildId, ticketId);

    if (ticket.status === 'Closed') {
      throw new ConflictError('Ticket is already closed');
    }

    const updated = await this.prisma.hrTicket.update({
      where: { ticketId },
      data: {
        response,
        respondedBy,
        respondedAt: new Date(),
        status: ticket.status === 'Open' ? 'Resolved' : ticket.status,
      },
    });

    this.logger.log(`Ticket ${ticketId} responded to by ${respondedBy}`);

    return {
      ticketId: updated.ticketId,
      status: updated.status,
    };
  }

  /**
   * Update ticket status
   */
  async updateTicketStatus(
    guildId: string,
    ticketId: string,
    status: string,
    assignedTo?: string,
  ): Promise<{ ticketId: string; status: string }> {
    const ticket = await this.getTicket(guildId, ticketId);

    const validStatuses = ['Open', 'In Progress', 'Resolved', 'Closed'];
    if (!validStatuses.includes(status)) {
      throw new ConflictError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    const updateData: any = { status };
    if (assignedTo) {
      updateData.assignedTo = assignedTo;
    }

    const updated = await this.prisma.hrTicket.update({
      where: { ticketId },
      data: updateData,
    });

    this.logger.log(`Ticket ${ticketId} status updated to ${status}`);

    return {
      ticketId: updated.ticketId,
      status: updated.status,
    };
  }

  /**
   * Get pending tickets (Open or In Progress)
   */
  async getPendingTickets(guildId: string) {
    return this.getTickets(guildId, {
      status: 'Open',
    });
  }
}
