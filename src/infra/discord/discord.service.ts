import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  Collection,
  PermissionFlagsBits,
  ChannelType,
  TextChannel,
  Guild,
  Role,
  User,
  GuildMember,
} from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';

/**
 * Discord Service - Manages Discord bot client and API interactions
 * Handles rate limiting, connection management, and Discord API wrapper
 */
@Injectable()
export class DiscordService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiscordService.name);
  public readonly client: Client;
  public readonly commands: Collection<string, any> = new Collection();
  private rest: REST;

  constructor(private configService: ConfigService) {
    const token = this.configService.get<string>('DISCORD_BOT_TOKEN');
    if (!token) {
      throw new Error('DISCORD_BOT_TOKEN is required');
    }

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
      ],
    });

    this.rest = new REST({ version: '10' }).setToken(token);

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.client.once('ready', () => {
      this.logger.log(`Bot logged in as ${this.client.user?.tag}`);
      this.logger.log(`Connected to ${this.client.guilds.cache.size} guilds`);
    });

    this.client.on('error', (error) => {
      this.logger.error('Discord client error:', error);
    });

    this.client.on('warn', (warning) => {
      this.logger.warn('Discord client warning:', warning);
    });

    this.client.on('rateLimit', (rateLimitInfo) => {
      this.logger.warn(`Rate limit hit: ${rateLimitInfo.path} - Retry after ${rateLimitInfo.retryAfter}ms`);
    });
  }

  async onModuleInit() {
    try {
      const token = this.configService.get<string>('DISCORD_BOT_TOKEN');
      await this.client.login(token);
      this.logger.log('Discord bot connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect Discord bot', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.client.destroy();
    this.logger.log('Discord bot disconnected');
  }

  /**
   * Register slash commands
   */
  async registerCommands(commands: SlashCommandBuilder[]) {
    try {
      const clientId = this.configService.get<string>('DISCORD_CLIENT_ID');
      const guildId = this.configService.get<string>('DISCORD_GUILD_ID');

      this.logger.log('Registering slash commands...');

      const commandsData = commands.map((cmd) => cmd.toJSON());

      if (guildId) {
        // Guild-specific commands (faster for development)
        await this.rest.put(Routes.applicationGuildCommands(clientId!, guildId), {
          body: commandsData,
        });
        this.logger.log(`Registered ${commandsData.length} guild commands`);
      } else {
        // Global commands (takes up to 1 hour to propagate)
        await this.rest.put(Routes.applicationCommands(clientId!), {
          body: commandsData,
        });
        this.logger.log(`Registered ${commandsData.length} global commands`);
      }
    } catch (error) {
      this.logger.error('Failed to register commands', error);
      throw error;
    }
  }

  /**
   * Get guild by ID
   */
  async getGuild(guildId: string): Promise<Guild | null> {
    try {
      return await this.client.guilds.fetch(guildId);
    } catch (error) {
      this.logger.error(`Failed to fetch guild ${guildId}`, error);
      return null;
    }
  }

  /**
   * Get user by ID
   */
  async getUser(userId: string): Promise<User | null> {
    try {
      return await this.client.users.fetch(userId);
    } catch (error) {
      this.logger.error(`Failed to fetch user ${userId}`, error);
      return null;
    }
  }

  /**
   * Get guild member by ID
   */
  async getGuildMember(guildId: string, userId: string): Promise<GuildMember | null> {
    try {
      const guild = await this.getGuild(guildId);
      if (!guild) return null;
      return await guild.members.fetch(userId);
    } catch (error) {
      this.logger.error(`Failed to fetch member ${guildId}/${userId}`, error);
      return null;
    }
  }

  /**
   * Send DM to user
   */
  async sendDM(userId: string, content: string): Promise<boolean> {
    try {
      const user = await this.getUser(userId);
      if (!user) return false;
      await user.send(content);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send DM to ${userId}`, error);
      return false;
    }
  }

  /**
   * Get text channel by ID
   */
  async getTextChannel(channelId: string): Promise<TextChannel | null> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (channel?.type === ChannelType.GuildText) {
        return channel as TextChannel;
      }
      return null;
    } catch (error) {
      this.logger.error(`Failed to fetch channel ${channelId}`, error);
      return null;
    }
  }
}
