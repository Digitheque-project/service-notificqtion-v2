import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { BroadcastNotificationDto } from './dto/broadcast-notification.dto';
import { NotifyServiceDto } from './dto/notify-service.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { NotificationGateway } from './notification.gateway';
import {
  NotificationStore,
  StoredNotification,
} from './notification.store';

/**
 * Duree de conservation des notifications (jours). Au-dela, elles sont purgees
 * au demarrage : le fichier de persistance ne grossit pas indefiniment.
 */
const RETENTION_JOURS_PAR_DEFAUT = 30;

@Injectable()
export class NotificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationService.name);
  private notifications: StoredNotification[] = [];

  constructor(
    private readonly notificationGateway: NotificationGateway,
    private readonly store: NotificationStore,
  ) {}

  // ---------------------------------------------------------------- cycle de vie

  onModuleInit(): void {
    this.notifications = this.purger(this.store.charger());
    this.logger.log(
      `${this.notifications.length} notification(s) rechargee(s) depuis ${this.store.chemin}`,
    );
    this.sauvegarder();
  }

  onModuleDestroy(): void {
    this.store.vider();
  }

  // ------------------------------------------------------------------- ecriture

  create(dto: CreateNotificationDto): NotificationResponseDto {
    const notification = this.construire({
      userId: dto.userId,
      title: dto.title,
      message: dto.message,
      type: dto.type ?? 'info',
      source: dto.source ?? 'system',
      data: dto.data,
      priority: dto.priority ?? 'normal',
    });

    this.ajouter(notification);
    this.notificationGateway.sendNotification(
      dto.userId,
      this.versReponse(notification),
    );

    return this.versReponse(notification);
  }

  broadcast(dto: BroadcastNotificationDto): NotificationResponseDto {
    const notification = this.construire({
      userId: 'broadcast',
      title: dto.title,
      message: dto.message,
      type: dto.type ?? 'info',
      source: dto.source ?? 'system',
      data: dto.data,
      priority: dto.priority ?? 'normal',
    });

    this.ajouter(notification);
    this.notificationGateway.broadcastNotification(
      this.versReponse(notification),
    );

    return this.versReponse(notification);
  }

  broadcastToRole(
    roleName: string,
    dto: BroadcastNotificationDto,
  ): NotificationResponseDto {
    const notification = this.construire({
      userId: 'broadcast',
      title: dto.title,
      message: dto.message,
      type: dto.type ?? 'info',
      source: dto.source ?? 'system',
      data: dto.data,
      priority: dto.priority ?? 'normal',
    });

    this.ajouter(notification);
    this.notificationGateway.sendToRole(
      roleName,
      this.versReponse(notification),
    );

    return this.versReponse(notification);
  }

  broadcastToRoleAndService(
    roleName: string,
    serviceId: string,
    dto: BroadcastNotificationDto,
  ): NotificationResponseDto {
    const notification = this.construire({
      userId: `broadcast:role:${roleName.toLowerCase()}:service:${serviceId}`,
      title: dto.title,
      message: dto.message,
      type: dto.type ?? 'info',
      source: dto.source ?? 'system',
      data: { ...dto.data, serviceId },
      priority: dto.priority ?? 'normal',
    });

    this.ajouter(notification);
    this.notificationGateway.sendToRoleAndService(
      roleName,
      serviceId,
      this.versReponse(notification),
    );

    return this.versReponse(notification);
  }

  /**
   * Notifie tout un service ET persiste la notification.
   *
   * Avant cette correction, le controleur appelait directement la gateway,
   * sans rien enregistrer : une notification de service etait perdue si
   * personne n'etait connecte a l'instant de l'emission, et l'indice (badge)
   * ne revenait jamais apres un rafraichissement. Elle est desormais stockee
   * sous la cle `broadcast:service:{serviceId}` et relue par
   * findByUser(userId, role, serviceId).
   */
  notifyService(dto: NotifyServiceDto): NotificationResponseDto {
    const notification = this.construire({
      userId: `broadcast:service:${dto.serviceId}`,
      title: dto.title,
      message: dto.message,
      type: dto.type ?? 'info',
      source: dto.source ?? 'system',
      data: { ...dto.data, serviceId: dto.serviceId },
      priority: 'normal',
    });

    this.ajouter(notification);
    this.notificationGateway.sendToService(
      dto.serviceId,
      this.versReponse(notification),
    );

    return this.versReponse(notification);
  }

  // ------------------------------------------------------------------- lecture

  /**
   * Notifications d'un utilisateur.
   *
   * `read` est calcule POUR CET UTILISATEUR : une notification diffusee a tout
   * un role/service reste "non lue" pour les collegues qui ne l'ont pas encore
   * ouverte.
   */
  findByUser(
    userId: string,
    role?: string,
    serviceId?: string,
  ): NotificationResponseDto[] {
    const compositeKey =
      role && serviceId
        ? `broadcast:role:${role.toLowerCase()}:service:${serviceId}`
        : null;
    // Notifications diffusees a tout un service (POST /notifications/service),
    // persistees sous la cle `broadcast:service:{serviceId}`.
    const serviceKey = serviceId ? `broadcast:service:${serviceId}` : null;

    return this.notifications
      .filter(
        (n) =>
          n.userId === userId ||
          n.userId === 'broadcast' ||
          (compositeKey && n.userId === compositeKey) ||
          (serviceKey && n.userId === serviceKey),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((n) => this.versReponse(n, userId));
  }

  findAll(): NotificationResponseDto[] {
    return [...this.notifications]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((n) => this.versReponse(n));
  }

  // --------------------------------------------------------------- accuses de lecture

  /**
   * Marque une notification comme lue.
   *
   * @param userId Utilisateur qui accuse reception. Fourni : l'accuse est
   * PERSONNEL (les autres destinataires gardent leur indice). Absent :
   * comportement historique, la notification est lue pour tout le monde.
   */
  markAsRead(id: string, userId?: string): NotificationResponseDto {
    const notification = this.notifications.find((n) => n.id === id);
    if (!notification) {
      throw new NotFoundException(`Notification #${id} introuvable`);
    }

    this.appliquerLecture(notification, userId);
    this.sauvegarder();

    return this.versReponse(notification, userId);
  }

  /**
   * Marque PLUSIEURS notifications comme lues en un seul appel.
   *
   * Les identifiants inconnus sont ignores silencieusement (une notification
   * peut avoir ete purgee) : le front ne doit jamais recevoir d'erreur pour un
   * simple accuse de lecture.
   */
  markManyAsRead(
    ids: string[],
    userId?: string,
  ): { updated: number; ignored: number } {
    const demandes = new Set(ids.filter(Boolean));
    let updated = 0;

    for (const notification of this.notifications) {
      if (!demandes.has(notification.id)) continue;
      this.appliquerLecture(notification, userId);
      updated += 1;
    }

    if (updated > 0) this.sauvegarder();
    return { updated, ignored: demandes.size - updated };
  }

  /** Marque comme lues TOUTES les notifications visibles par un utilisateur. */
  markAllAsRead(
    userId: string,
    role?: string,
    serviceId?: string,
  ): { updated: number } {
    const visibles = this.findByUser(userId, role, serviceId)
      .filter((n) => !n.read)
      .map((n) => n.id);

    return { updated: this.markManyAsRead(visibles, userId).updated };
  }

  deleteAllByUser(userId: string): number {
    const avant = this.notifications.length;
    this.notifications = this.notifications.filter((n) => n.userId !== userId);
    const supprimees = avant - this.notifications.length;
    if (supprimees > 0) this.sauvegarder();
    return supprimees;
  }

  // -------------------------------------------------------------------- internes

  private construire(
    base: Omit<StoredNotification, 'id' | 'createdAt' | 'read' | 'readBy'>,
  ): StoredNotification {
    return {
      ...base,
      id: uuidv4(),
      createdAt: new Date(),
      read: false,
      readBy: [],
    };
  }

  private ajouter(notification: StoredNotification): void {
    this.notifications.push(notification);
    this.sauvegarder();
  }

  private appliquerLecture(
    notification: StoredNotification,
    userId?: string,
  ): void {
    if (userId) {
      if (!notification.readBy.includes(userId)) {
        notification.readBy.push(userId);
      }
      // Destinataire unique : l'accuse personnel vaut accuse global.
      if (notification.userId === userId) notification.read = true;
      return;
    }
    notification.read = true;
  }

  /** Vue exposee par l'API : `read` resolu pour l'utilisateur demandeur. */
  private versReponse(
    notification: StoredNotification,
    userId?: string,
  ): NotificationResponseDto {
    const { readBy, ...reste } = notification;
    return {
      ...reste,
      read: userId ? notification.read || readBy.includes(userId) : notification.read,
    };
  }

  private sauvegarder(): void {
    this.store.enregistrer(this.notifications);
  }

  /** Retire les notifications trop anciennes (retention configurable). */
  private purger(notifications: StoredNotification[]): StoredNotification[] {
    const jours =
      Number(process.env.NOTIFICATION_RETENTION_DAYS) ||
      RETENTION_JOURS_PAR_DEFAUT;
    if (jours <= 0) return notifications;

    const limite = Date.now() - jours * 24 * 60 * 60 * 1000;
    return notifications.filter((n) => n.createdAt.getTime() >= limite);
  }
}
