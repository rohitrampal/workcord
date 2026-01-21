import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { DatabaseModule } from '@infra/database/database.module';

/**
 * Audit Module
 * Provides audit logging functionality
 */
@Module({
  imports: [DatabaseModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
