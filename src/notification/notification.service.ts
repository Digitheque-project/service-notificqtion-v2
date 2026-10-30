import {
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { BroadcastNotificationDto } from './dto/broadcast-notification.dto';
import { NotifyServiceDto } from './dto/notify-service.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { NotificationGateway } from './notification.gateway';
import { NotificationStore, StoredNotification } from './notification.store';

/**
 * Durée de conservation (jours) : 0 = tout conserver. L'historique vit désormais en
 * base (requêtes indexées), il n'a plus besoin d'être purgé pour rester rapide.
 */
const RETENTION_JOURS_PAR_DEFAUT = 0;

@Injectable()
export class NotificationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly notificationGateway: NotificationGateway,
    private readonly store: NotificationStore,
  ) {}

  // ---------------------------------------------------------------- cycle de vie

  async onApplicationBootstrap(): Promise<void> {
    const jours =
      Number(process.env.NOTIFICATION_RETENTION_DAYS) ||
      RETENTION_JOURS_PAR_DEFAUT;
    const purgees = await this.store.purger(jours).catch(() => 0);
    if (purgees) {
      this.logger.log(
        `${purgees} notification(s) de plus de ${jours} jours purgée(s)`,
      );
    }
  }

  // ------------------------------------------------------------------- écriture

  async create(dto: CreateNotificationDto): Promise<NotificationResponseDto> {
    const notification = await this.enregistrer({
      userId: dto.userId,
      title: dto.title,
      message: dto.message,
      type: dto.type ?? 'info',
      source: dto.source ?? 'system',
      data: dto.data,
      priority: dto.priority ?? 'normal',
    });
    this.notificationGateway.sendNotification(dto.userId, notification);
    return notification;
  }

  async broadcast(
    dto: BroadcastNotificationDto,
  ): Promise<NotificationResponseDto> {
    const notification = await this.enregistrer({
      userId: 'broadcast',
      title: dto.title,
      message: dto.message,
      type: dto.type ?? 'info',
      source: dto.source ?? 'system',
      data: dto.data,
      priority: dto.priority ?? 'normal',
    });
    this.notificationGateway.broadcastNotification(notification);
    return notification;
  }

  async broadcastToRole(
    roleName: string,
    dto: BroadcastNotificationDto,
  ): Promise<NotificationResponseDto> {
    const notification = await this.enregistrer({
      userId: 'broadcast',
      title: dto.title,
      message: dto.message,
      type: dto.type ?? 'info',
      source: dto.source ?? 'system',
      data: dto.data,
      priority: dto.priority ?? 'normal',
    });
    this.notificationGateway.sendToRole(roleName, notification);
    return notification;
  }

  async broadcastToRoleAndService(
    roleName: string,
    serviceId: string,
    dto: BroadcastNotificationDto,
  ): Promise<NotificationResponseDto> {
    const notification = await this.enregistrer({
      userId: `broadcast:role:${roleName.toLowerCase()}:service:${serviceId}`,
      title: dto.title,
      message: dto.message,
      type: dto.type ?? 'info',
      source: dto.source ?? 'system',
      data: { ...dto.data, serviceId },
      priority: dto.priority ?? 'normal',
    });
    this.notificationGateway.sendToRoleAndService(
      roleName,
      serviceId,
      notification,
    );
    return notification;
  }

  /**
   * Notifie tout un service ET conserve la notification (clé
   * `broadcast:service:{serviceId}`) : elle reste visible après un rafraîchissement,
   * même si personne n'était connecté à l'instant de l'émission.
   */
  async notifyService(dto: NotifyServiceDto): Promise<NotificationResponseDto> {
    const notification = await this.enregistrer({
      userId: `broadcast:service:${dto.serviceId}`,
      title: dto.title,
      message: dto.message,
      type: dto.type ?? 'info',
      source: dto.source ?? 'system',
      data: { ...dto.data, serviceId: dto.serviceId },
      priority: 'normal',
    });
    this.notificationGateway.sendToService(dto.serviceId, notification);
    return notification;
  }

  // ------------------------------------------------------------------- lecture

  /**
   * Notifications visibles par un utilisateur : les siennes, celles diffusées à son
   * service et à son rôle dans ce service. `read` est résolu POUR CET UTILISATEUR.
   */
  async findByUser(
    userId: string,
    role?: string,
    serviceId?: string,
  ): Promise<NotificationResponseDto[]> {
    const destinataires = [userId, 'broadcast'];
    if (serviceId) destinataires.push(`broadcast:service:${serviceId}`);
    if (role && serviceId) {
      destinataires.push(
        `broadcast:role:${role.toLowerCase()}:service:${serviceId}`,
      );
    }
    return this.store.parDestinataires(destinataires, userId);
  }

  async findAll(): Promise<NotificationResponseDto[]> {
    return this.store.recentes();
  }

  // --------------------------------------------------------------- accusés de lecture

  /**
   * Marque une notification comme lue. Avec un utilisateur : accusé PERSONNEL (les
   * autres destinataires gardent leur indice). Sans : lue pour tout le monde.
   */
  async markAsRead(
    id: string,
    userId?: string,
  ): Promise<NotificationResponseDto> {
    if ((await this.store.marquerLues([id], userId)) === 0) {
      throw new NotFoundException(`Notification #${id} introuvable`);
    }
    const notification = await this.store.trouver(id, userId);
    if (!notification)
      throw new NotFoundException(`Notification #${id} introuvable`);
    return notification;
  }

  /**
   * Marque PLUSIEURS notifications comme lues en un seul appel. Les identifiants
   * inconnus (notifications purgées) sont ignorés silencieusement.
   */
  async markManyAsRead(
    ids: string[],
    userId?: string,
  ): Promise<{ updated: number; ignored: number }> {
    const demandes = [...new Set(ids.filter(Boolean))];
    const updated = await this.store.marquerLues(demandes, userId);
    return { updated, ignored: demandes.length - updated };
  }

  /** Marque comme lues TOUTES les notifications visibles par un utilisateur. */
  async markAllAsRead(
    userId: string,
    role?: string,
    serviceId?: string,
  ): Promise<{ updated: number }> {
    const visibles = (await this.findByUser(userId, role, serviceId))
      .filter((n) => !n.read)
      .map((n) => n.id);
    return { updated: (await this.markManyAsRead(visibles, userId)).updated };
  }

  async deleteAllByUser(userId: string): Promise<number> {
    return this.store.supprimerDestinataire(userId);
  }

  // -------------------------------------------------------------------- internes

  private async enregistrer(
    base: Omit<StoredNotification, 'id' | 'createdAt' | 'read'>,
  ): Promise<StoredNotification> {
    const notification: StoredNotification = {
      ...base,
      id: uuidv4(),
      createdAt: new Date(),
      read: false,
    };
    await this.store.inserer(notification);
    return notification;
  }
}
