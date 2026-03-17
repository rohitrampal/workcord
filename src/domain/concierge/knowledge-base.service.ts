import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@infra/database/prisma.service';
import { NotFoundError } from '@shared/utils/errors';

/**
 * Knowledge Base Service
 * Handles knowledge base article management
 */
@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Create a new article
   */
  async createArticle(
    guildId: string,
    title: string,
    content: string,
    category: string,
    tags: string[],
    createdBy: string,
  ) {
    const article = await this.prisma.knowledgeArticle.create({
      data: {
        guildId,
        title,
        content,
        category,
        tags,
        createdBy,
      },
    });

    this.logger.log(`Knowledge article created: ${article.id} in guild ${guildId}`);

    return article;
  }

  /**
   * Get article by ID
   */
  async getArticle(guildId: string, articleId: string) {
    const article = await this.prisma.knowledgeArticle.findUnique({
      where: { id: articleId },
    });

    if (!article) {
      throw new NotFoundError('Article');
    }

    if (article.guildId !== guildId) {
      throw new NotFoundError('Article');
    }

    // Increment view count
    await this.prisma.knowledgeArticle.update({
      where: { id: articleId },
      data: { views: { increment: 1 } },
    });

    return article;
  }

  /**
   * Search articles
   */
  async searchArticles(
    guildId: string,
    query: string,
    category?: string,
  ) {
    const where: any = {
      guildId,
      isPublished: true,
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { content: { contains: query, mode: 'insensitive' } },
        { tags: { hasSome: [query] } },
      ],
    };

    if (category) {
      where.category = category;
    }

    return this.prisma.knowledgeArticle.findMany({
      where,
      orderBy: [
        { views: 'desc' },
        { helpful: 'desc' },
        { createdAt: 'desc' },
      ],
      take: 10,
    });
  }

  /**
   * Get articles by category
   */
  async getArticlesByCategory(guildId: string, category: string) {
    return this.prisma.knowledgeArticle.findMany({
      where: {
        guildId,
        category,
        isPublished: true,
      },
      orderBy: [
        { views: 'desc' },
        { helpful: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  /**
   * Get all categories
   */
  async getCategories(guildId: string): Promise<string[]> {
    const articles = await this.prisma.knowledgeArticle.findMany({
      where: {
        guildId,
        isPublished: true,
      },
      select: {
        category: true,
      },
      distinct: ['category'],
    });

    return articles.map((a) => a.category);
  }

  /**
   * Update article feedback
   */
  async updateFeedback(articleId: string, helpful: boolean) {
    const article = await this.prisma.knowledgeArticle.findUnique({
      where: { id: articleId },
    });

    if (!article) {
      throw new NotFoundError('Article');
    }

    const updateData = helpful
      ? { helpful: { increment: 1 } }
      : { notHelpful: { increment: 1 } };

    return this.prisma.knowledgeArticle.update({
      where: { id: articleId },
      data: updateData,
    });
  }

  /**
   * Update article
   */
  async updateArticle(
    guildId: string,
    articleId: string,
    updatedBy: string,
    title?: string,
    content?: string,
    category?: string,
    tags?: string[],
  ) {
    const article = await this.getArticle(guildId, articleId);

    const updateData: any = { updatedBy };
    if (title) updateData.title = title;
    if (content) updateData.content = content;
    if (category) updateData.category = category;
    if (tags) updateData.tags = tags;

    return this.prisma.knowledgeArticle.update({
      where: { id: articleId },
      data: updateData,
    });
  }

  /**
   * Delete article (soft delete by unpublishing)
   */
  async deleteArticle(guildId: string, articleId: string) {
    const article = await this.getArticle(guildId, articleId);

    return this.prisma.knowledgeArticle.update({
      where: { id: articleId },
      data: { isPublished: false },
    });
  }
}
