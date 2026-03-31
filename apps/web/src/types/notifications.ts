// apps/web/src/types/notifications.ts
// Stub — extended as needed

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  createdAt: string;
  read?: boolean;
}
