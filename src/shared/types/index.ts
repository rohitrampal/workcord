/**
 * Shared types and interfaces for PraXio
 */

export enum RoleLevel {
  SUPER_ADMIN = 1,
  ADMIN = 2,
  BUSINESS_OWNER = 3,
  STAKEHOLDER = 4,
  LEADER = 5,
  MANAGER = 6,
  INDIVIDUAL_CONTRIBUTOR = 7,
}

export enum ChannelType {
  GENERAL = 'general',
  ADMIN = 'admin',
  LEADERSHIP = 'leadership',
  MARKETING = 'marketing',
  SALES = 'sales',
  ACCOUNTS = 'accounts',
  OPERATIONS = 'operations',
  TECH = 'tech',
  SUPPORT = 'support',
  CONCIERGE = 'concierge',
}

export enum LeaveType {
  SICK_LEAVE = 'Sick Leave',
  CASUAL_LEAVE = 'Casual Leave',
  EARNED_LEAVE = 'Earned Leave',
  UNPAID_LEAVE = 'Unpaid Leave',
}

export enum LeaveStatus {
  PENDING = 'Pending',
  APPROVED = 'Approved',
  REJECTED = 'Rejected',
}

export enum TaskStatus {
  NOT_STARTED = 'Not Started',
  IN_PROGRESS = 'In Progress',
  BLOCKED = 'Blocked',
  COMPLETED = 'Completed',
  CANCELLED = 'Cancelled',
}

export enum TaskPriority {
  LOW = 'Low',
  NORMAL = 'Normal',
  HIGH = 'High',
  CRITICAL = 'Critical',
}

export enum AttendanceLocation {
  OFFICE = 'Office',
  WFH = 'WFH',
  OUTDOOR = 'Outdoor',
  SITE_VISIT = 'Site Visit',
}

export interface ReminderTimes {
  todoReminder: string; // "09:15"
  eodReminder: string; // "18:00"
  defaulterCheck: {
    todo: string; // "10:00"
    eod: string; // "19:00"
  };
}

export interface PenaltyConfig {
  todoDefault: number;
  eodDefault: number;
  attendanceDefault: number;
}

export interface LeaveQuotas {
  sick: number;
  casual: number;
  earned: number;
  unpaid: number;
}

export interface AuditAction {
  ROLE_CHANGE: 'role_change';
  CHANNEL_MODIFY: 'channel_modify';
  COMMAND_USAGE: 'command_usage';
  LEAVE_APPROVE: 'leave_approve';
  LEAVE_REJECT: 'leave_reject';
  TASK_CREATE: 'task_create';
  TASK_UPDATE: 'task_update';
  CONFIG_UPDATE: 'config_update';
  PENALTY_ASSIGN: 'penalty_assign';
  PENALTY_CLEAR: 'penalty_clear';
}
