import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
} from '@nestjs/swagger';
import { NotificationGateway } from './notification.gateway';
import { NotificationService } from './notification.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { BroadcastNotificationDto } from './dto/broadcast-notification.dto';
import { NotifyServiceDto } from './dto/notify-service.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Créer et envoyer une notification',
    description:
      'Permet à un service d\'envoyer une notification en temps réel à un utilisateur spécifique via WebSocket.',
  })
  @ApiCreatedResponse({
    type: NotificationResponseDto,
    description: 'Notification créée et diffusée',
  })
  create(
    @Body() createNotificationDto: CreateNotificationDto,
  ): NotificationResponseDto {
    return this.notificationService.create(createNotificationDto);
  }

  @Post('service')
  @ApiOperation({
    summary: 'Notifier tout un service',
    description:
      'Envoie une notification en temps réel à tous les utilisateurs connectés d\'un service donné.',
  })
  notifyService(
    @Body() dto: NotifyServiceDto,
  ): { sent: boolean } {
    this.notificationGateway.sendToService(dto.serviceId, {
      title: dto.title,
      message: dto.message,
      type: dto.type ?? 'info',
      source: dto.source ?? 'system',
      data: dto.data ?? {},
      createdAt: new Date(),
    });
    return { sent: true };
  }

  @Post('broadcast')
  @ApiOperation({
    summary: 'Diffuser une notification à tous',
    description: 'Diffuse une notification en temps réel à tous les utilisateurs connectés via WebSocket.',
  })
  @ApiCreatedResponse({
    type: NotificationResponseDto,
    description: 'Notification diffusée',
  })
  broadcast(
    @Body() dto: BroadcastNotificationDto,
  ): NotificationResponseDto {
    return this.notificationService.broadcast(dto);
  }

  @Post('broadcast/role/:roleName')
  @ApiOperation({
    summary: 'Diffuser une notification à un rôle',
    description: 'Diffuse une notification en temps réel à tous les utilisateurs connectés ayant un rôle donné.',
  })
  broadcastToRole(
    @Param('roleName') roleName: string,
    @Body() dto: BroadcastNotificationDto,
  ): { sent: boolean } {
    this.notificationGateway.sendToRole(roleName, {
      id: crypto.randomUUID(),
      userId: 'broadcast',
      title: dto.title,
      message: dto.message,
      type: dto.type ?? 'info',
      source: dto.source ?? 'system',
      data: dto.data,
      createdAt: new Date(),
      read: false,
    });
    return { sent: true };
  }

  @Get()
  @ApiOperation({
    summary: 'Lister toutes les notifications',
    description: 'Retourne toutes les notifications (tous utilisateurs confondus).',
  })
  @ApiOkResponse({
    type: [NotificationResponseDto],
    description: 'Liste de toutes les notifications',
  })
  findAll(): NotificationResponseDto[] {
    return this.notificationService.findAll();
  }

  @Get('user/:userId')
  @ApiOperation({
    summary: 'Notifications d\'un utilisateur',
    description: 'Retourne toutes les notifications d\'un utilisateur spécifique.',
  })
  @ApiParam({
    name: 'userId',
    description: 'Identifiant unique de l\'utilisateur',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    type: [NotificationResponseDto],
    description: 'Notifications de l\'utilisateur',
  })
  findByUser(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): NotificationResponseDto[] {
    return this.notificationService.findByUser(userId);
  }

  @Post(':id/read')
  @ApiOperation({
    summary: 'Marquer comme lue',
    description: 'Marque une notification comme lue par son identifiant.',
  })
  @ApiParam({
    name: 'id',
    description: 'Identifiant de la notification',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    type: NotificationResponseDto,
    description: 'Notification marquée comme lue',
  })
  markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
  ): NotificationResponseDto {
    return this.notificationService.markAsRead(id);
  }

  @Delete('user/:userId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Supprimer toutes les notifications',
    description: 'Supprime toutes les notifications d\'un utilisateur.',
  })
  @ApiParam({
    name: 'userId',
    description: 'Identifiant unique de l\'utilisateur',
  })
  deleteAllByUser(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): void {
    this.notificationService.deleteAllByUser(userId);
  }
}
