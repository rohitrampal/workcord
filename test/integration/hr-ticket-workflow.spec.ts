/**
 * Integration Tests - HR Ticket Workflow
 */

import { Test, TestingModule } from '@nestjs/testing';
import { HrTicketService } from '@domain/concierge/hr-ticket.service';
import { PrismaService } from '@infra/database/prisma.service';
import { testPrisma, createTestGuild, createTestUser } from '../setup';

describe('HR Ticket Workflow Integration', () => {
  let service: HrTicketService;
  let guildId: string;
  let userId: string;
  let adminId: string;

  beforeAll(async () => {
    const guild = await createTestGuild();
    const user = await createTestUser(guild.id);
    const admin = await createTestUser(guild.id, { id: 'admin-123' });
    guildId = guild.id;
    userId = user.id;
    adminId = admin.id;
  });

  beforeEach(async () => {
    // Ensure guild exists first - create if doesn't exist
    const existingGuild = await testPrisma.guild.findUnique({ where: { id: guildId } });
    if (!existingGuild) {
      await testPrisma.guild.create({
        data: {
          id: guildId,
          name: 'Test Guild',
          ownerId: 'test-owner-123',
          isProvisioned: true,
        },
      });
    }
    // Then ensure users exist - create if doesn't exist
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
    const existingAdmin = await testPrisma.user.findUnique({
      where: { guildId_id: { guildId, id: adminId } },
    });
    if (!existingAdmin) {
      await testPrisma.user.create({
        data: {
          id: adminId,
          guildId,
          username: 'admin',
          discriminator: '0001',
        },
      });
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

  it('should complete full HR ticket workflow', async () => {
    // Step 1: User creates ticket
    const ticket = await service.createTicket(guildId, userId, 'Leave', 'How do I apply?');

    expect(ticket.status).toBe('Open');

    // Step 2: Admin views ticket
    const viewed = await service.getTicket(guildId, ticket.ticketId);

    expect(viewed.ticketId).toBe(ticket.ticketId);

    // Step 3: Admin responds
    const responded = await service.respondToTicket(
      guildId,
      ticket.ticketId,
      adminId,
      'Use /leave apply command',
    );

    expect(responded.status).toBe('Resolved');
    // Verify response in database
    const dbResponded = await testPrisma.hrTicket.findUnique({
      where: { ticketId: responded.ticketId },
    });
    expect(dbResponded?.response).toBeDefined();

    // Step 4: Verify ticket history
    const history = await service.getTickets(guildId, { userId });

    expect(history.length).toBeGreaterThan(0);
    expect(history[0].status).toBe('Resolved');
  });
});
