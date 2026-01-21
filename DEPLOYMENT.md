# PraXio Deployment Guide

## Prerequisites

- Docker and Docker Compose installed
- Discord Bot Token and Client ID
- PostgreSQL 16+ (or use Docker)
- Redis 7+ (or use Docker)

## Quick Start

1. **Clone and Setup**
   ```bash
   git clone <repository-url>
   cd praxio
   cp .env.example .env
   ```

2. **Configure Environment**
   Edit `.env` file with your Discord bot credentials:
   ```
   DISCORD_BOT_TOKEN=your_bot_token
   DISCORD_CLIENT_ID=your_client_id
   DISCORD_GUILD_ID=your_guild_id (optional, for faster command registration)
   ```

3. **Start with Docker**
   ```bash
   docker-compose up -d
   ```

4. **Run Database Migrations**
   ```bash
   docker-compose exec bot npm run prisma:migrate
   ```

5. **View Logs**
   ```bash
   docker-compose logs -f bot
   ```

## Local Development

1. **Start Database and Redis**
   ```bash
   docker-compose up -d postgres redis
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Generate Prisma Client**
   ```bash
   npm run prisma:generate
   ```

4. **Run Migrations**
   ```bash
   npm run prisma:migrate
   ```

5. **Start Bot**
   ```bash
   npm run start:dev
   ```

## Discord Bot Setup

1. Go to https://discord.com/developers/applications
2. Create a new application
3. Go to "Bot" section and create a bot
4. Copy the bot token
5. Enable these intents:
   - Server Members Intent
   - Message Content Intent
6. Go to "OAuth2" > "URL Generator"
7. Select scopes: `bot`, `applications.commands`
8. Select bot permissions:
   - Manage Roles
   - Manage Channels
   - Send Messages
   - Read Message History
   - View Channels
9. Copy the generated URL and invite bot to your server

## Production Deployment

### Environment Variables

Ensure all required environment variables are set:
- `DISCORD_BOT_TOKEN` - Required
- `DISCORD_CLIENT_ID` - Required
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `NODE_ENV=production`

### Health Checks

- Bot: Check Discord connection status
- Database: `pg_isready`
- Redis: `redis-cli ping`

### Scaling Considerations

- Use Bull queues with Redis for background jobs (recommended for production)
- Consider read replicas for database
- Use connection pooling for database
- Monitor Discord API rate limits

## Troubleshooting

### Bot Not Responding
- Check bot token is correct
- Verify bot has necessary permissions
- Check intents are enabled in Discord Developer Portal

### Database Connection Issues
- Verify DATABASE_URL is correct
- Check PostgreSQL is running
- Verify network connectivity

### Commands Not Appearing
- Commands take up to 1 hour to propagate globally
- Use DISCORD_GUILD_ID for instant guild-specific commands
- Check bot has `applications.commands` scope

## Monitoring

- Check logs: `docker-compose logs -f bot`
- Database status: `docker-compose exec postgres pg_isready`
- Redis status: `docker-compose exec redis redis-cli ping`
