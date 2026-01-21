import { Module } from '@nestjs/common';
import { ProvisioningService } from './provisioning.service';
import { DatabaseModule } from '@infra/database/database.module';
import { DiscordModule } from '@infra/discord/discord.module';

/**
 * Provisioning Module
 * Handles auto-provisioning of roles and channels
 */
@Module({
  imports: [DatabaseModule, DiscordModule],
  providers: [ProvisioningService],
  exports: [ProvisioningService],
})
export class ProvisioningModule {}
