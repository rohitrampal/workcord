# PraXio Architecture Overview

## System Architecture

PraXio follows **Clean Architecture** principles with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────┐
│                    Bot Module (Entry Point)            │
│  - Command Handlers                                     │
│  - Event Listeners                                      │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
┌───────▼────────┐ ┌──────▼────────┐ ┌─────▼──────────┐
│  Domain Layer   │ │ Infrastructure │ │  Shared Layer  │
│                 │ │     Layer      │ │                │
│  - HRMS         │ │  - Discord     │ │  - Types       │
│  - WFM          │ │  - Database    │ │  - Utils       │
│  - Tasks        │ │  - Redis        │ │  - Config      │
│  - Concierge    │ │                 │ │                │
│  - Audit        │ │                 │ │                │
│  - Scheduling   │ │                 │ │                │
│  - Reporting    │ │                 │ │                │
└─────────────────┘ └─────────────────┘ └────────────────┘
```

## Module Structure

### Domain Layer (`src/domain/`)

Business logic and core functionality:

- **provisioning/** - Auto-provisioning of roles and channels
- **hrms/** - Attendance and leave management
- **wfm/** - Productivity tracking (To-Do, EOD updates)
- **tasks/** - Task management and tracking
- **concierge/** - Private channel system and personal stats
- **audit/** - Audit logging for compliance
- **scheduling/** - Reminder and background job scheduling
- **reporting/** - Analytics and report generation

### Infrastructure Layer (`src/infra/`)

External service integrations:

- **discord/** - Discord.js client and API wrapper
- **database/** - Prisma ORM service
- **redis/** - Redis client for caching and queues

### Bot Layer (`src/bot/`)

Discord bot implementation:

- **commands/** - Slash command handlers
- **bot.service.ts** - Main bot service coordinating interactions
- **bot.module.ts** - Bot module configuration

### Shared Layer (`src/shared/`)

Common utilities and types:

- **types/** - TypeScript types and enums
- **utils/** - Utility functions (errors, date, validation)
- **config/** - Configuration and environment validation

## Data Flow

### Command Execution Flow

```
User Command → Discord API → Bot Service → Command Handler
    ↓
Domain Service → Database/External API
    ↓
Response → Discord API → User
```

### Auto-Provisioning Flow

```
Bot Joins Server → GuildCreate Event → Provisioning Service
    ↓
Create Roles → Create Channels → Update Database
    ↓
Send Welcome Message
```

### Reminder Flow

```
Scheduler (Cron) → Check Reminder Times → Reminder Service
    ↓
Get WFM Channels → Send Reminder Messages
    ↓
Defaulter Check → Notify Admins → DM Defaulters
```

## Database Schema

### Core Tables

1. **guilds** - Discord server information
2. **roles** - Role definitions and permissions
3. **channels** - Channel configurations
4. **users** - User profiles and role mappings

### HRMS Tables

5. **attendance** - Check-in/check-out records
6. **leaves** - Leave applications and approvals

### WFM Tables

7. **todos** - To-Do list entries
8. **updates** - EOD update entries

### Task Management

9. **tasks** - Task assignments and tracking
10. **planner_plans** - Sprint and OKR data

### System Tables

11. **audit_logs** - Complete action audit trail
12. **concierge_channels** - User-to-channel mappings

## Key Design Decisions

### 1. Clean Architecture

- **Separation of Concerns**: Business logic separated from infrastructure
- **Dependency Inversion**: Domain layer doesn't depend on infrastructure
- **Testability**: Easy to mock dependencies for testing

### 2. Type Safety

- **Strict TypeScript**: Full type safety throughout
- **Zod Validation**: Runtime validation for user inputs
- **Prisma Types**: Type-safe database queries

### 3. Scalability

- **Modular Design**: Each feature is a separate module
- **Background Jobs**: Scheduled tasks don't block main thread
- **Database Indexing**: Optimized queries for large datasets

### 4. Compliance & Audit

- **Complete Audit Trail**: All actions logged
- **Transaction Safety**: Database operations are transactional
- **Idempotent Commands**: Commands can be safely retried

### 5. Error Handling

- **Centralized Error Handling**: Consistent error responses
- **Graceful Degradation**: System continues operating on errors
- **Comprehensive Logging**: All errors logged with context

## Command Structure

All commands follow this pattern:

```typescript
// 1. Define command
static getCommands(): SlashCommandBuilder[]

// 2. Handle command
async handleCommand(interaction: ChatInputCommandInteraction): Promise<void>

// 3. Validate input
// 4. Call domain service
// 5. Log audit
// 6. Send response
```

## Scheduling System

### Current Implementation

- Uses `@nestjs/schedule` with cron expressions
- Runs every minute to check reminder times
- Suitable for small to medium deployments

### Production Recommendation

- Use Bull queues with Redis for better scalability
- Separate worker processes for background jobs
- Better error handling and retry logic
- Job prioritization and rate limiting

## Security Considerations

1. **Input Validation**: All user inputs validated with Zod
2. **Role-Based Access**: Commands check user permissions
3. **Audit Logging**: All actions logged for compliance
4. **Rate Limiting**: Discord API rate limits respected
5. **Error Messages**: No sensitive data in error messages

## Performance Optimizations

1. **Database Indexing**: Indexes on frequently queried fields
2. **Connection Pooling**: Prisma handles connection pooling
3. **Caching**: Redis for frequently accessed data (future)
4. **Lazy Loading**: Discord API calls only when needed
5. **Batch Operations**: Bulk operations where possible

## Future Enhancements

1. **Bull Queues**: Replace cron with Bull for better scalability
2. **Webhook API**: REST API for external integrations
3. **Real-time Analytics**: WebSocket for live dashboards
4. **Multi-language Support**: i18n for commands
5. **Advanced Reporting**: PDF export, charts, etc.
6. **Mobile App**: React Native app for mobile access
7. **SSO Integration**: Single sign-on for enterprise clients

## Testing Strategy

### Unit Tests
- Test domain services in isolation
- Mock infrastructure dependencies
- Test error handling and edge cases

### Integration Tests
- Test command handlers with mocked Discord API
- Test database operations
- Test scheduled tasks

### E2E Tests
- Test full command flow
- Test auto-provisioning
- Test reminder system

## Deployment Architecture

```
┌─────────────┐
│   Discord   │
│    API      │
└──────┬──────┘
       │
┌──────▼──────┐
│  PraXio Bot │
└──────┬──────┘
       │
   ┌───┴───┐
   │       │
┌──▼──┐ ┌──▼──┐
│PostgreSQL│ │Redis│
└─────────┘ └─────┘
```

## Monitoring & Observability

- **Logging**: Structured logging with Winston (future)
- **Metrics**: Prometheus metrics (future)
- **Health Checks**: Docker health checks for all services
- **Error Tracking**: Sentry integration (future)
