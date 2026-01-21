import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@infra/database/prisma.service';
import { DiscordService } from '@infra/discord/discord.service';
import {
  PermissionFlagsBits,
  ChannelType,
  Role,
  TextChannel,
  Guild,
  OverwriteType,
} from 'discord.js';
import { RoleLevel, ChannelType as ChannelTypeEnum } from '@shared/types';

/**
 * Auto-Provisioning Service
 * Handles automatic role and channel creation when bot joins a server
 */
@Injectable()
export class ProvisioningService {
  private readonly logger = new Logger(ProvisioningService.name);

  constructor(
    private prisma: PrismaService,
    private discord: DiscordService,
  ) {}

  /**
   * Provision guild with roles and channels
   */
  async provisionGuild(guildId: string): Promise<void> {
    const guild = await this.discord.getGuild(guildId);
    if (!guild) {
      throw new Error(`Guild ${guildId} not found`);
    }

    // Check if already provisioned
    const existingGuild = await this.prisma.guild.findUnique({
      where: { id: guildId },
    });

    if (existingGuild?.isProvisioned) {
      this.logger.log(`Guild ${guildId} already provisioned`);
      return;
    }

    this.logger.log(`Starting provisioning for guild ${guildId} (${guild.name})`);

    await this.prisma.$transaction(async (tx) => {
      // Create or update guild record
      await tx.guild.upsert({
        where: { id: guildId },
        create: {
          id: guildId,
          name: guild.name,
          ownerId: guild.ownerId,
          isProvisioned: false, // Will be set to true after provisioning
          reminderTimes: {
            todoReminder: '09:15',
            eodReminder: '18:00',
            defaulterCheck: {
              todo: '10:00',
              eod: '19:00',
            },
          },
          penaltyConfig: {
            todoDefault: 1,
            eodDefault: 1,
            attendanceDefault: 2,
          },
          leaveQuotas: {
            sick: 12,
            casual: 12,
            earned: 15,
            unpaid: 0,
          },
        },
        update: {
          name: guild.name,
          ownerId: guild.ownerId,
        },
      });

      // Create roles
      const roles = await this.createRoles(guild, tx);

      // Create channels
      await this.createChannels(guild, roles, tx);

      // Mark as provisioned
      await tx.guild.update({
        where: { id: guildId },
        data: { isProvisioned: true },
      });
    });

    // Send welcome message
    await this.sendWelcomeMessage(guild);

    this.logger.log(`Guild ${guildId} provisioned successfully`);
  }

  /**
   * Create hierarchical roles
   */
  private async createRoles(guild: Guild, tx: any): Promise<Map<number, Role>> {
    const roleMap = new Map<number, Role>();
    const roleDefinitions = [
      { name: 'Super Admin', level: RoleLevel.SUPER_ADMIN, color: 0xff0000 },
      { name: 'Admin', level: RoleLevel.ADMIN, color: 0xff6600 },
      { name: 'Business Owner', level: RoleLevel.BUSINESS_OWNER, color: 0x0066ff },
      { name: 'Stakeholder', level: RoleLevel.STAKEHOLDER, color: 0x00ff00 },
      { name: 'Leader', level: RoleLevel.LEADER, color: 0x9900ff },
      { name: 'Manager', level: RoleLevel.MANAGER, color: 0x0099ff },
      { name: 'Individual Contributor', level: RoleLevel.INDIVIDUAL_CONTRIBUTOR, color: 0x666666 },
    ];

    // Create roles in reverse order (lowest to highest) to maintain hierarchy
    for (const def of roleDefinitions.reverse()) {
      try {
        // Check if role already exists
        let role = guild.roles.cache.find((r) => r.name === def.name);
        if (!role) {
          role = await guild.roles.create({
            name: def.name,
            color: def.color,
            mentionable: true,
            permissions: this.getRolePermissions(def.level),
          });
          this.logger.log(`Created role: ${def.name}`);
        }

        // Save to database
        await tx.role.upsert({
          where: {
            guildId_name: {
              guildId: guild.id,
              name: def.name,
            },
          },
          create: {
            id: role.id,
            guildId: guild.id,
            name: def.name,
            level: def.level,
            permissions: role.permissions.toArray(),
          },
          update: {
            level: def.level,
            permissions: role.permissions.toArray(),
          },
        });

        roleMap.set(def.level, role);
      } catch (error) {
        this.logger.error(`Failed to create role ${def.name}`, error);
        throw error;
      }
    }

    return roleMap;
  }

  /**
   * Get permissions for role level
   */
  private getRolePermissions(level: RoleLevel): bigint {
    switch (level) {
      case RoleLevel.SUPER_ADMIN:
        return PermissionFlagsBits.Administrator;
      case RoleLevel.ADMIN:
        return (
          PermissionFlagsBits.ManageChannels |
          PermissionFlagsBits.ManageRoles |
          PermissionFlagsBits.ViewAuditLog |
          PermissionFlagsBits.ManageMessages |
          PermissionFlagsBits.SendMessages
        );
      case RoleLevel.BUSINESS_OWNER:
        return (
          PermissionFlagsBits.ManageChannels |
          PermissionFlagsBits.ViewAuditLog |
          PermissionFlagsBits.SendMessages
        );
      case RoleLevel.STAKEHOLDER:
        return PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages;
      case RoleLevel.LEADER:
        return (
          PermissionFlagsBits.ManageMessages |
          PermissionFlagsBits.MentionEveryone |
          PermissionFlagsBits.SendMessages
        );
      case RoleLevel.MANAGER:
        return (
          PermissionFlagsBits.SendMessages |
          PermissionFlagsBits.CreatePublicThreads |
          PermissionFlagsBits.EmbedLinks
        );
      case RoleLevel.INDIVIDUAL_CONTRIBUTOR:
        return PermissionFlagsBits.SendMessages | PermissionFlagsBits.ReadMessageHistory;
      default:
        return PermissionFlagsBits.SendMessages;
    }
  }

  /**
   * Create channels
   */
  private async createChannels(guild: Guild, roles: Map<number, Role>, tx: any): Promise<void> {
    const channelDefinitions = [
      { name: 'general', type: ChannelTypeEnum.GENERAL, isWfmEnabled: true },
      { name: 'admin', type: ChannelTypeEnum.ADMIN, isWfmEnabled: false },
      { name: 'leadership', type: ChannelTypeEnum.LEADERSHIP, isWfmEnabled: true },
      { name: 'marketing', type: ChannelTypeEnum.MARKETING, isWfmEnabled: true },
      { name: 'sales', type: ChannelTypeEnum.SALES, isWfmEnabled: true },
      { name: 'accounts', type: ChannelTypeEnum.ACCOUNTS, isWfmEnabled: true },
      { name: 'operations', type: ChannelTypeEnum.OPERATIONS, isWfmEnabled: true },
      { name: 'tech', type: ChannelTypeEnum.TECH, isWfmEnabled: true },
      { name: 'support', type: ChannelTypeEnum.SUPPORT, isWfmEnabled: true },
    ];

    for (const def of channelDefinitions) {
      try {
        // Check if channel already exists
        let channel = guild.channels.cache.find(
          (c) => c.name === def.name && c.type === ChannelType.GuildText,
        ) as TextChannel;

        if (!channel) {
          channel = await guild.channels.create({
            name: def.name,
            type: ChannelType.GuildText,
            permissionOverwrites: this.getChannelPermissions(def.type, roles),
          });
          this.logger.log(`Created channel: #${def.name}`);
        }

        // Save to database
        await tx.channel.upsert({
          where: {
            guildId_name: {
              guildId: guild.id,
              name: def.name,
            },
          },
          create: {
            id: channel.id,
            guildId: guild.id,
            name: def.name,
            type: def.type,
            isWfmEnabled: def.isWfmEnabled,
          },
          update: {
            isWfmEnabled: def.isWfmEnabled,
          },
        });
      } catch (error) {
        this.logger.error(`Failed to create channel ${def.name}`, error);
        throw error;
      }
    }
  }

  /**
   * Get channel permission overwrites
   */
  private getChannelPermissions(
    channelType: ChannelTypeEnum,
    roles: Map<number, Role>,
  ): Array<{ id: string; type: OverwriteType; allow: bigint; deny: bigint }> {
    const overwrites: Array<{ id: string; type: OverwriteType; allow: bigint; deny: bigint }> = [];

    // Everyone can view general channel
    if (channelType === ChannelTypeEnum.GENERAL) {
      overwrites.push({
        id: roles.get(RoleLevel.INDIVIDUAL_CONTRIBUTOR)!.id,
        type: OverwriteType.Role,
        allow: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages,
        deny: 0n,
      });
    }

    // Admin channel - only Admin and above
    if (channelType === ChannelTypeEnum.ADMIN) {
      overwrites.push({
        id: roles.get(RoleLevel.ADMIN)!.id,
        type: OverwriteType.Role,
        allow: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages,
        deny: 0n,
      });
      overwrites.push({
        id: roles.get(RoleLevel.INDIVIDUAL_CONTRIBUTOR)!.id,
        type: OverwriteType.Role,
        allow: 0n,
        deny: PermissionFlagsBits.ViewChannel,
      });
    }

    // Departmental channels - Manager and above can manage
    const departmentalChannels = [
      ChannelTypeEnum.LEADERSHIP,
      ChannelTypeEnum.MARKETING,
      ChannelTypeEnum.SALES,
      ChannelTypeEnum.ACCOUNTS,
      ChannelTypeEnum.OPERATIONS,
      ChannelTypeEnum.TECH,
      ChannelTypeEnum.SUPPORT,
    ];

    if (departmentalChannels.includes(channelType)) {
      overwrites.push({
        id: roles.get(RoleLevel.MANAGER)!.id,
        type: OverwriteType.Role,
        allow:
          PermissionFlagsBits.ViewChannel |
          PermissionFlagsBits.SendMessages |
          PermissionFlagsBits.ManageMessages,
        deny: 0n,
      });
    }

    return overwrites;
  }

  /**
   * Send welcome message
   */
  private async sendWelcomeMessage(guild: Guild): Promise<void> {
    const generalChannel = guild.channels.cache.find(
      (c) => c.name === 'general' && c.type === ChannelType.GuildText,
    ) as TextChannel;

    if (generalChannel) {
      await generalChannel.send({
        embeds: [
          {
            title: '🎉 PraXio Setup Complete!',
            description: 'Your server has been automatically provisioned with roles and channels.',
            color: 0x00ff00,
            fields: [
              {
                name: '✅ Roles Created',
                value: '7 hierarchical roles have been set up',
                inline: true,
              },
              {
                name: '✅ Channels Created',
                value: '9 channels have been configured',
                inline: true,
              },
              {
                name: '📚 Next Steps',
                value: 'Use `/help` to see all available commands',
                inline: false,
              },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      });
    }
  }
}
