/**
 * Knowledge Base Service Tests
 */

import { Test, TestingModule } from '@nestjs/testing';
import { KnowledgeBaseService } from '@domain/concierge/knowledge-base.service';
import { PrismaService } from '@infra/database/prisma.service';
import { testPrisma, createTestGuild, createTestUser } from '../setup';

describe('KnowledgeBaseService', () => {
  let service: KnowledgeBaseService;
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
      } catch (error: any) {
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
    // Then ensure user exists - create if doesn't exist
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
        if (error.code === 'P2003') {
          // FK constraint - ensure guild exists
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

  describe('createArticle', () => {
    it('should create knowledge article', async () => {
      const result = await service.createArticle(
        guildId,
        'Test Article',
        'Content',
        'Policies',
        ['tag1', 'tag2'],
        userId,
      );

      expect(result.id).toBeDefined();
      expect(result.title).toBe('Test Article');
      expect(result.category).toBe('Policies');
    });
  });

  describe('searchArticles', () => {
    it('should search articles by query', async () => {
      const article = await service.createArticle(
        guildId,
        'Leave Policy',
        'How to apply for leave',
        'Policies',
        ['leave', 'policy'],
        userId,
      );
      
      // Publish the article so it appears in search results
      await testPrisma.knowledgeArticle.update({
        where: { id: article.id },
        data: { isPublished: true },
      });

      const results = await service.searchArticles(guildId, 'leave');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toContain('Leave');
    });

    it('should filter by category', async () => {
      const article1 = await service.createArticle(guildId, 'Article 1', 'Content', 'Policies', [], userId);
      const article2 = await service.createArticle(guildId, 'Article 2', 'Content', 'FAQs', [], userId);
      
      // Publish articles so they appear in search results
      await testPrisma.knowledgeArticle.updateMany({
        where: { id: { in: [article1.id, article2.id] } },
        data: { isPublished: true },
      });

      const results = await service.searchArticles(guildId, 'Article', 'Policies');

      results.forEach((article) => {
        expect(article.category).toBe('Policies');
      });
    });
  });

  describe('getArticlesByCategory', () => {
    it('should return articles by category', async () => {
      await service.createArticle(guildId, 'Policy 1', 'Content', 'Policies', [], userId);
      await service.createArticle(guildId, 'Policy 2', 'Content', 'Policies', [], userId);

      const articles = await service.getArticlesByCategory(guildId, 'Policies');

      expect(articles.length).toBeGreaterThanOrEqual(2);
      articles.forEach((article) => {
        expect(article.category).toBe('Policies');
      });
    });
  });

  describe('getArticle', () => {
    it('should increment view count', async () => {
      const article = await service.createArticle(
        guildId,
        'View Test',
        'Content',
        'Policies',
        [],
        userId,
      );

      const initialViews = article.views;

      await service.getArticle(guildId, article.id);

      const updated = await testPrisma.knowledgeArticle.findUnique({
        where: { id: article.id },
      });

      expect(updated?.views).toBe(initialViews + 1);
    });
  });

  describe('updateFeedback', () => {
    it('should update helpful count', async () => {
      const article = await service.createArticle(
        guildId,
        'Feedback Test',
        'Content',
        'Policies',
        [],
        userId,
      );
      
      // Ensure article exists before updating feedback
      const existingArticle = await testPrisma.knowledgeArticle.findUnique({
        where: { id: article.id },
      });
      expect(existingArticle).toBeDefined();

      await service.updateFeedback(article.id, true);

      const updated = await testPrisma.knowledgeArticle.findUnique({
        where: { id: article.id },
      });

      expect(updated?.helpful).toBe(1);
    });

    it('should update not helpful count', async () => {
      const article = await service.createArticle(
        guildId,
        'Feedback Test 2',
        'Content',
        'Policies',
        [],
        userId,
      );

      const updated = await service.updateFeedback(article.id, false);

      expect(updated).toBeDefined();
      // Fetch again to verify the update persisted
      const refreshed = await testPrisma.knowledgeArticle.findUnique({
        where: { id: article.id },
      });
      expect(refreshed?.notHelpful).toBe(1);
    });
  });
});
