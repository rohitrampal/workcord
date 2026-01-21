# PraXio - Enterprise Workforce Management Solution for Discord

PraXio is an enterprise-grade Discord bot that transforms Discord servers into comprehensive Workforce Management (WFM) platforms. It provides HRMS, productivity tracking, task management, and analytics directly within Discord.

## 🏗️ Architecture

- **Framework**: NestJS with TypeScript
- **Discord Library**: discord.js v14+
- **Database**: PostgreSQL with Prisma ORM
- **Queue/Scheduling**: Redis with Bull
- **Architecture Pattern**: Clean Architecture (Domain → Service → Infrastructure)

## 📋 Features

### Core Modules

1. **Auto-Provisioning System**
   - Automatic role and channel creation
   - Permission configuration
   - Welcome system

2. **HRMS Module**
   - Attendance tracking (check-in/check-out)
   - Leave management with approval workflows
   - Compliance and penalty system

3. **WFM Productivity Suite**
   - To-Do list tracking with morning reminders
   - EOD (End of Day) updates with evening reminders
   - Defaulter tracking and alerts

4. **Task Management**
   - Task creation, assignment, and tracking
   - Priority and status management
   - Overdue task detection

5. **Concierge Channel System**
   - Private channels for each team member
   - Personal statistics dashboard
   - HR help desk integration

6. **Admin & Governance**
   - Complete audit logging
   - Configuration management
   - Bulk operations

7. **Reporting & Analytics**
   - Attendance reports
   - Leave summaries
   - Task completion analytics
   - Compliance reports

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- Docker and Docker Compose
- PostgreSQL 16+
- Redis 7+
- Discord Bot Token

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd praxio
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Generate Prisma Client:
```bash
npm run prisma:generate
```

5. Run database migrations:
```bash
npm run prisma:migrate
```

### Running with Docker

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f bot

# Stop services
docker-compose down
```

### Running Locally

```bash
# Start database and Redis
docker-compose up -d postgres redis

# Run migrations
npm run prisma:migrate

# Start bot in development mode
npm run start:dev
```

## 📁 Project Structure

```
praxio/
├── src/
│   ├── domain/          # Domain entities and business logic
│   ├── infra/           # Infrastructure layer (Discord, DB, Redis)
│   ├── shared/          # Shared utilities and types
│   ├── bot/             # Discord bot module
│   ├── api/             # REST API module (future)
│   └── main.ts          # Application entry point
├── prisma/
│   └── schema.prisma    # Database schema
├── docker-compose.yml   # Docker services configuration
└── package.json
```

## 🔧 Configuration

### Discord Bot Setup

1. Create a Discord application at https://discord.com/developers/applications
2. Create a bot and copy the token
3. Enable Server Members Intent and Message Content Intent
4. Invite bot to your server with appropriate permissions

### Environment Variables

See `.env.example` for all required environment variables.

## 📝 Commands

### Attendance
- `/checkin [location]` - Check in for the day
- `/checkout` - Check out and log hours

### Leave Management
- `/leave apply` - Apply for leave
- `/leave balance` - Check leave balance
- `/leave approve [id]` - Approve leave (Admin)
- `/leave reject [id] [reason]` - Reject leave (Admin)

### Tasks
- `/task create` - Create a new task
- `/task update [id]` - Update task status
- `/task mylist` - View your tasks
- `/task teamlist` - View team tasks

### Personal
- `/mystats` - View personal statistics
- `/hrhelp` - Submit HR query
- `/knowledgebase` - Access company documentation

### Admin
- `/admin audit` - View audit logs
- `/admin config` - Manage bot configuration
- `/admin penalties` - Manage penalty points

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## 📊 Database

### Prisma Commands

```bash
# Generate Prisma Client
npm run prisma:generate

# Create migration
npm run prisma:migrate

# Open Prisma Studio
npm run prisma:studio
```

## 🔒 Security

- All sensitive data stored in secure database (not Discord messages)
- Role-based access control (RBAC)
- Complete audit logging
- Input validation with Zod
- Rate limiting for Discord API

## 📈 Scaling Considerations

- Designed for 10,000+ users per server
- Redis-based job queues for background tasks
- Database indexing on frequently queried fields
- Efficient Discord API usage with rate limit handling

## 🤝 Contributing

This is an enterprise project. Please follow:
- Clean architecture principles
- TypeScript strict mode
- Comprehensive error handling
- Transaction-safe database operations

## 📄 License

MIT

## 🆘 Support

For issues and questions, please contact the development team.
