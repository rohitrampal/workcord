/**
 * Integration Tests - Knowledge Base Workflow
 */

import { Test, TestingModule } from '@nestjs/testing';
import { KnowledgeBaseService } from '@domain/concierge/knowledge-base.service';
import { PrismaService } from '@infra/database/prisma.service';
import { testPrisma, createTestGuild, createTestUser } from '../setup';

describe('Knowledge Base Workflow Integration', () => {
  let service: KnowledgeBaseService;
  let guildId: string;
  let userId: string;

  beforeAll(async () => {
    const guild = await createTestGuild();
    const user = await createTestUser(guild.id);
    guildId = guild.id;
    userId = user.id;
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeBaseService,
        {
          provide: PrismaService,
          useValue: testPrisma,
        },
      ],
    }).compile();

    service = module.get<KnowledgeBaseService>(KnowledgeBaseService);
  });

  it('should complete full knowledge base workflow', async () => {
    // Step 1: Admin creates article
    const article = await service.createArticle(
      guildId,
      'Leave Policy',
      'Complete leave policy documentation',
      'Policies',
      ['leave', 'policy', 'hr'],
      userId,
    );

    expect(article.id).toBeDefined();
    expect(article.isPublished).toBe(true);

    // Step 2: User searches for article
    const searchResults = await service.searchArticles(guildId, 'leave');

    expect(searchResults.length).toBeGreaterThan(0);
    expect(searchResults[0].title).toContain('Leave');

    // Step 3: User views article
    await service.getArticle(guildId, article.id);

    const viewed = await testPrisma.knowledgeArticle.findUnique({
      where: { id: article.id },
    });

    expect(viewed?.views).toBe(1);

    // Step 4: User provides feedback
    await service.updateFeedback(article.id, true);

    const feedback = await testPrisma.knowledgeArticle.findUnique({
      where: { id: article.id },
    });

    expect(feedback?.helpful).toBe(1);
  });
});
