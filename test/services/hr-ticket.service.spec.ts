/**
 * HR Ticket Service Tests
 */

import { Test, TestingModule } from '@nestjs/testing';
import { HrTicketService } from '@domain/concierge/hr-ticket.service';
import { PrismaService } from '@infra/database/prisma.service';
import { testPrisma, createTestGuild, createTestUser } from '../setup';

describe('HrTicketService', () => {
  let service: HrTicketService;
  let guildId: string;
  let userId: string;
  let adminId: string;

  beforeAll(async () => {
    // Just set IDs, don't create records yet
    guildId = `test-guild-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    userId = `test-user-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    adminId = 'admin-123';
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
      } catch (error: any) {
        // If creation fails, check again - might have been created by another test
        if (error.code !== 'P2002') {
          existingGuild = await testPrisma.guild.findUnique({ where: { id: guildId } });
          if (!existingGuild) {
            throw error;
          }
        } else {
          existingGuild = await testPrisma.guild.findUnique({ where: { id: guildId } });
          if (!existingGuild) {
            throw error;
          }
        }
      }
    }
    // Then ensure users exist - create if doesn't exist
    const existingUser = await testPrisma.user.findUnique({
      where: { guildId_id: { guildId, id: userId } },
    });
    if (!existingUser) {
      try {
        await testPrisma.user.create({
          data: {
            id: userId,
            guildId,
            username: 'testuser',
            discriminator: '0001',
          },
        });
      } catch (error: any) {
        // If creation fails due to FK, ensure guild exists and retry
        if (error.code === 'P2003') {
          const guildCheck = await testPrisma.guild.findUnique({ where: { id: guildId } });
          if (!guildCheck) {
            await testPrisma.guild.create({
              data: {
                id: guildId,
                name: 'Test Guild',
                ownerId: 'test-owner-123',
                isProvisioned: true,
              },
            });
          }
          // Retry user creation
          await testPrisma.user.create({
            data: {
              id: userId,
              guildId,
              username: 'testuser',
              discriminator: '0001',
            },
          });
        } else {
          throw error;
        }
      }
    }
    const existingAdmin = await testPrisma.user.findUnique({
      where: { guildId_id: { guildId, id: adminId } },
    });
    if (!existingAdmin) {
      try {
        await testPrisma.user.create({
          data: {
            id: adminId,
            guildId,
            username: 'admin',
            discriminator: '0001',
          },
        });
      } catch (error: any) {
        if (error.code === 'P2003') {
          const guildCheck = await testPrisma.guild.findUnique({ where: { id: guildId } });
          if (!guildCheck) {
            await testPrisma.guild.create({
              data: {
                id: guildId,
                name: 'Test Guild',
                ownerId: 'test-owner-123',
                isProvisioned: true,
              },
            });
          }
          await testPrisma.user.create({
            data: {
              id: adminId,
              guildId,
              username: 'admin',
              discriminator: '0001',
            },
          });
        } else {
          throw error;
        }
      }
    }
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HrTicketService,
        {
          provide: PrismaService,
          useValue: testPrisma,
        },
      ],
    }).compile();

    service = module.get<HrTicketService>(HrTicketService);
  });

  describe('createTicket', () => {
    it('should create HR ticket', async () => {
      const result = await service.createTicket(guildId, userId, 'Leave', 'How do I apply?');

      expect(result.ticketId).toBeDefined();
      expect(result.status).toBe('Open');
    });
  });

  describe('getTicket', () => {
    it('should retrieve ticket by ID', async () => {
      const ticket = await service.createTicket(guildId, userId, 'General', 'Question');

      const retrieved = await service.getTicket(guildId, ticket.ticketId);

      expect(retrieved.ticketId).toBe(ticket.ticketId);
      expect(retrieved.question).toBe('Question');
    });
  });

  describe('getTickets', () => {
    it('should list tickets with filters', async () => {
      await service.createTicket(guildId, userId, 'Leave', 'Question 1');
      await service.createTicket(guildId, userId, 'Attendance', 'Question 2');

      const tickets = await service.getTickets(guildId, { status: 'Open' });

      expect(tickets.length).toBeGreaterThan(0);
      tickets.forEach((ticket: any) => {
        expect(ticket.status).toBe('Open');
      });
    });
  });

  describe('respondToTicket', () => {
    it('should respond to ticket and update status', async () => {
      const ticket = await service.createTicket(guildId, userId, 'General', 'Question');

      const result = await service.respondToTicket(
        guildId,
        ticket.ticketId,
        adminId,
        'Response text',
      );

      expect(result.status).toBe('Resolved');
      expect(result.ticketId).toBe(ticket.ticketId);
      
      // Verify the response was saved by fetching the ticket
      const updated = await service.getTicket(guildId, ticket.ticketId);
      expect(updated.response).toBe('Response text');
      expect(updated.respondedBy).toBe(adminId);
    });
  });
});
