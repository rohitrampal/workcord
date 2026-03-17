import { plainToInstance } from 'class-transformer';
import { IsString, IsOptional, IsNumber, IsEnum, validateSync } from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsOptional()
  @IsString()
  DISCORD_BOT_TOKEN?: string;

  @IsOptional()
  @IsString()
  DISCORD_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  DISCORD_GUILD_ID?: string;

  @IsString()
  DATABASE_URL: string;

  @IsOptional()
  @IsString()
  REDIS_URL?: string;

  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV?: Environment;

  @IsString()
  @IsOptional()
  TIMEZONE?: string;

  @IsNumber()
  @IsOptional()
  API_PORT?: number;

  @IsString()
  @IsOptional()
  API_KEY?: string;

  @IsString()
  @IsOptional()
  LOG_LEVEL?: string;
}

export function validateConfig(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
