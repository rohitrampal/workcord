import { z } from 'zod';

/**
 * Zod validation schemas for command inputs
 */

export const checkInSchema = z.object({
  location: z.enum(['Office', 'WFH', 'Outdoor', 'Site Visit']),
});

export const leaveApplySchema = z.object({
  leaveType: z.enum(['Sick Leave', 'Casual Leave', 'Earned Leave', 'Unpaid Leave']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().min(10).max(500),
});

export const leaveApproveSchema = z.object({
  applicationId: z.string().uuid(),
});

export const leaveRejectSchema = z.object({
  applicationId: z.string().uuid(),
  reason: z.string().min(10).max(500),
});

export const taskCreateSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(1000).optional(),
  assigneeId: z.string(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priority: z.enum(['Low', 'Normal', 'High', 'Critical']).optional(),
});

export const taskUpdateSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(['Not Started', 'In Progress', 'Blocked', 'Completed', 'Cancelled']).optional(),
  blockerReason: z.string().max(500).optional(),
});

export const hrHelpSchema = z.object({
  category: z.enum(['Leave', 'Attendance', 'Payroll', 'General']),
  question: z.string().min(10).max(1000),
});
