import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { BroadcastNotificationDto } from './dto/broadcast-notification.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { NotificationGateway } from './notification.gateway';

@Injectable()
export class NotificationService {
  private notifications: NotificationResponseDto[] = [];

  constructor(private readonly notificationGateway: NotificationGateway) {}

  create(dto: CreateNotificationDto): NotificationResponseDto {
    const notification: NotificationResponseDto = {
      id: uuidv4(),
      userId: dto.userId,
      title: dto.title,
      message: dto.message,
      type: dto.type ?? 'info',
      source: dto.source ?? 'system',
      data: dto.data,
      createdAt: new Date(),
      read: false,
      priority: 'normal',
    };

    this.notifications.push(notification);

    this.notificationGateway.sendNotification(dto.userId, notification);

    return notification;
  }

  findByUser(userId: string, role?: string, serviceId?: string): NotificationResponseDto[] {
    const compositeKey = role && serviceId
      ? `broadcast:role:${role.toLowerCase()}:service:${serviceId}`
      : null;

    return this.notifications
      .filter((n) =>
        n.userId === userId ||
        n.userId === 'broadcast' ||
        (compositeKey && n.userId === compositeKey)
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  markAsRead(id: string): NotificationResponseDto {
    const notification = this.notifications.find((n) => n.id === id);
    if (!notification) {
      throw new NotFoundException(`Notification #${id} introuvable`);
    }
    notification.read = true;
    return notification;
  }

  findAll(): NotificationResponseDto[] {
    return this.notifications.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  broadcast(dto: BroadcastNotificationDto): NotificationResponseDto {
    const notification: NotificationResponseDto = {
      id: uuidv4(),
      userId: 'broadcast',
      title: dto.title,
      message: dto.message,
      type: dto.type ?? 'info',
      source: dto.source ?? 'system',
      data: dto.data,
      createdAt: new Date(),
      read: false,
      priority: dto.priority ?? 'normal',
    };

    this.notifications.push(notification);
    this.notificationGateway.broadcastNotification(notification);

    return notification;
  }

  broadcastToRole(roleName: string, dto: BroadcastNotificationDto): NotificationResponseDto {
    const notification: NotificationResponseDto = {
      id: uuidv4(),
      userId: 'broadcast',
      title: dto.title,
      message: dto.message,
      type: dto.type ?? 'info',
      source: dto.source ?? 'system',
      data: dto.data,
      createdAt: new Date(),
      read: false,
      priority: dto.priority ?? 'normal',
    };

    this.notifications.push(notification);
    this.notificationGateway.sendToRole(roleName, notification);

    return notification;
  }

  broadcastToRoleAndService(roleName: string, serviceId: string, dto: BroadcastNotificationDto): NotificationResponseDto {
    const notification: NotificationResponseDto = {
      id: uuidv4(),
      userId: `broadcast:role:${roleName.toLowerCase()}:service:${serviceId}`,
      title: dto.title,
      message: dto.message,
      type: dto.type ?? 'info',
      source: dto.source ?? 'system',
      data: { ...dto.data, serviceId },
      createdAt: new Date(),
      read: false,
      priority: dto.priority ?? 'normal',
    };

    this.notifications.push(notification);
    this.notificationGateway.sendToRoleAndService(roleName, serviceId, notification);

    return notification;
  }

  deleteAllByUser(userId: string): number {
    const before = this.notifications.length;
    this.notifications = this.notifications.filter((n) => n.userId !== userId);
    return before - this.notifications.length;
  }
}
