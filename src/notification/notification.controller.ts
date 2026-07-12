import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
} from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

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
}
