import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  Req,
  ForbiddenException,
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
import { BroadcastNotificationDto } from './dto/broadcast-notification.dto';
import { NotifyServiceDto } from './dto/notify-service.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';
import {
  MarkAllReadDto,
  MarkManyReadDto,
  MarkReadDto,
  MarkReadResultDto,
} from './dto/mark-read.dto';
import type { RequeteAuthentifiee } from '../auth/auth.guard';
import { serviceDuJeton } from '../auth/jeton';
import type { Identite } from '../auth/jeton';

/** Réservé aux jetons de service (diffusions larges, liste complète). */
function exigerService(identite: Identite): void {
  if (!identite.estService) {
    throw new ForbiddenException('Réservé aux services de la plateforme');
  }
}

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post()
  @ApiOperation({
    summary: 'Créer et envoyer une notification',
    description:
      "Permet à un service d'envoyer une notification en temps réel à un utilisateur spécifique via WebSocket.",
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
      "Envoie une notification en temps réel à tous les utilisateurs connectés d'un service donné.",
  })
  notifyService(@Body() dto: NotifyServiceDto): { sent: boolean } {
    // Persiste PUIS diffuse : la notification survit desormais au
    // rafraichissement (indice recharge via GET /notifications/user/:userId).
    this.notificationService.notifyService(dto);
    return { sent: true };
  }

  @Post('broadcast')
  @ApiOperation({
    summary: 'Diffuser une notification à tous',
    description:
      'Diffuse une notification en temps réel à tous les utilisateurs connectés via WebSocket.',
  })
  @ApiCreatedResponse({
    type: NotificationResponseDto,
    description: 'Notification diffusée',
  })
  broadcast(
    @Req() req: RequeteAuthentifiee,
    @Body() dto: BroadcastNotificationDto,
  ): NotificationResponseDto {
    // Atteint TOUS les utilisateurs de tous les CHU : jamais depuis un navigateur.
    exigerService(req.identite);
    return this.notificationService.broadcast(dto);
  }

  @Post('broadcast/role/:roleName')
  @ApiOperation({
    summary: 'Diffuser une notification à un rôle',
    description:
      'Diffuse une notification en temps réel à tous les utilisateurs connectés ayant un rôle donné.',
  })
  broadcastToRole(
    @Req() req: RequeteAuthentifiee,
    @Param('roleName') roleName: string,
    @Body() dto: BroadcastNotificationDto,
  ): NotificationResponseDto {
    // Un rôle de TOUTE la plateforme (tous services, tous CHU) : services seulement.
    exigerService(req.identite);
    return this.notificationService.broadcastToRole(roleName, dto);
  }

  @Post('broadcast/role-service/:roleName/:serviceId')
  @ApiOperation({
    summary: 'Diffuser une notification à un rôle dans un service',
    description:
      'Diffuse une notification en temps réel aux utilisateurs connectés ayant un rôle donné ET appartenant à un service donné.',
  })
  broadcastToRoleAndService(
    @Param('roleName') roleName: string,
    @Param('serviceId') serviceId: string,
    @Body() dto: BroadcastNotificationDto,
  ): NotificationResponseDto {
    return this.notificationService.broadcastToRoleAndService(
      roleName,
      serviceId,
      dto,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Lister toutes les notifications',
    description:
      'Retourne toutes les notifications (tous utilisateurs confondus).',
  })
  @ApiOkResponse({
    type: [NotificationResponseDto],
    description: 'Liste de toutes les notifications',
  })
  findAll(@Req() req: RequeteAuthentifiee): NotificationResponseDto[] {
    // Un utilisateur ne reçoit que SES notifications (lui, ses services, ses rôles) :
    // jamais celles des autres services ni des autres CHU.
    if (!req.identite.estService) return this.lecturesDe(req.identite);
    return this.notificationService.findAll();
  }

  @Get('user/:userId')
  @ApiOperation({
    summary: "Notifications d'un utilisateur",
    description:
      "Retourne toutes les notifications d'un utilisateur spécifique. Optionnellement filtrer par role et serviceId pour les notifications broadcast ciblées. Le champ `read` est résolu POUR CET UTILISATEUR : une notification diffusée reste non lue pour les collègues qui ne l'ont pas ouverte.",
  })
  @ApiParam({
    name: 'userId',
    description: "Identifiant unique de l'utilisateur",
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    type: [NotificationResponseDto],
    description: "Notifications de l'utilisateur",
  })
  findByUser(
    @Req() req: RequeteAuthentifiee,
    @Param('userId') userId: string,
    @Query('role') role?: string,
    @Query('serviceId') serviceId?: string,
  ): NotificationResponseDto[] {
    const { identite } = req;
    if (identite.estService) {
      return this.notificationService.findByUser(userId, role, serviceId);
    }
    // Utilisateur : son identité et ses rôles viennent du jeton, jamais de l'adresse.
    if (!serviceId) return this.lecturesDe(identite);
    const entree = serviceDuJeton(identite, serviceId);
    if (!entree) throw new ForbiddenException("Ce service n'est pas le vôtre");
    return this.notificationService.findByUser(
      identite.userId,
      entree.roleName,
      serviceId,
    );
  }

  /** Notifications visibles par un utilisateur, pour chacun de ses services. */
  private lecturesDe(identite: Identite): NotificationResponseDto[] {
    const parId = new Map<string, NotificationResponseDto>();
    const sources = identite.services.length
      ? identite.services.map((s) =>
          this.notificationService.findByUser(
            identite.userId,
            s.roleName,
            s.serviceId,
          ),
        )
      : [this.notificationService.findByUser(identite.userId)];
    for (const liste of sources) for (const n of liste) parId.set(n.id, n);
    return [...parId.values()].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  @Post('read')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Marquer plusieurs notifications comme lues',
    description:
      'Accuse de lecture GROUPE : un seul appel pour toute une liste. ' +
      "Si userId est fourni, l'accusé est PERSONNEL (les autres destinataires " +
      "d'une notification diffusée à un rôle/service gardent leur indice). " +
      'Les identifiants inconnus (notifications purgées) sont ignorés.',
  })
  @ApiOkResponse({
    type: MarkReadResultDto,
    description: 'Nombre de notifications marquées comme lues',
  })
  markManyAsRead(
    @Req() req: RequeteAuthentifiee,
    @Body() dto: MarkManyReadDto,
  ): MarkReadResultDto {
    // Accusé PERSONNEL de l'utilisateur du jeton (jamais pour tout le monde).
    const userId = req.identite.estService ? dto.userId : req.identite.userId;
    return this.notificationService.markManyAsRead(dto.ids, userId);
  }

  @Post('user/:userId/read-all')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Tout marquer comme lu',
    description:
      'Marque comme lues toutes les notifications visibles par un utilisateur ' +
      '(y compris celles diffusées à son rôle et à son service).',
  })
  @ApiParam({
    name: 'userId',
    description: "Identifiant unique de l'utilisateur",
  })
  @ApiOkResponse({
    type: MarkReadResultDto,
    description: 'Nombre de notifications marquées comme lues',
  })
  markAllAsRead(
    @Req() req: RequeteAuthentifiee,
    @Param('userId') userId: string,
    @Body() dto: MarkAllReadDto,
  ): { updated: number } {
    const { identite } = req;
    if (identite.estService) {
      return this.notificationService.markAllAsRead(
        userId,
        dto?.role,
        dto?.serviceId,
      );
    }
    const entree = serviceDuJeton(identite, dto?.serviceId);
    if (dto?.serviceId && !entree)
      throw new ForbiddenException("Ce service n'est pas le vôtre");
    return this.notificationService.markAllAsRead(
      identite.userId,
      entree?.roleName,
      dto?.serviceId,
    );
  }

  @Post(':id/read')
  @ApiOperation({
    summary: 'Marquer comme lue',
    description:
      'Marque une notification comme lue par son identifiant. Transmettre ' +
      'userId dans le corps pour un accusé de lecture PERSONNEL (recommandé ' +
      'pour les notifications diffusées à un rôle/service).',
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
    @Req() req: RequeteAuthentifiee,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkReadDto,
  ): NotificationResponseDto {
    const userId = req.identite.estService ? dto?.userId : req.identite.userId;
    return this.notificationService.markAsRead(id, userId);
  }

  @Delete('user/:userId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Supprimer toutes les notifications',
    description: "Supprime toutes les notifications d'un utilisateur.",
  })
  @ApiParam({
    name: 'userId',
    description: "Identifiant unique de l'utilisateur",
  })
  deleteAllByUser(
    @Req() req: RequeteAuthentifiee,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): void {
    if (!req.identite.estService && userId !== req.identite.userId) {
      throw new ForbiddenException('Seulement vos propres notifications');
    }
    this.notificationService.deleteAllByUser(userId);
  }
}
