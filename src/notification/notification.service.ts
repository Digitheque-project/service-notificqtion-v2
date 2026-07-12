import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { CreateNotificationDto } from './dto/create-notification.dto';
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
    };

    this.notifications.push(notification);

    this.notificationGateway.sendNotification(dto.userId, notification);

    return notification;
  }

  findByUser(userId: string): NotificationResponseDto[] {
    return this.notifications
      .filter((n) => n.userId === userId)
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

  deleteAllByUser(userId: string): number {
    const before = this.notifications.length;
    this.notifications = this.notifications.filter((n) => n.userId !== userId);
    return before - this.notifications.length;
  }
}
