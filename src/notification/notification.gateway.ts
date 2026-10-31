import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { extraireJeton, serviceDuJeton, verifierJeton } from '../auth/jeton';
import type { Identite } from '../auth/jeton';

type DonneesSocket = { identite?: Identite };

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/notifications',
})
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NotificationGateway.name);
  private connectedUsers = new Map<
    string,
    { name: string; firstname: string }
  >();

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    const jeton =
      (client.handshake.auth?.token as string | undefined) ||
      (client.handshake.query.token as string | undefined) ||
      extraireJeton(client.handshake.headers.authorization) ||
      null;
    const secret = process.env.JWT_SECRET;
    const identite = jeton && secret ? verifierJeton(jeton, secret) : null;
    if (!identite) {
      // Plus aucune connexion anonyme : les salons d'un service ou d'un CHU ne
      // s'écoutent qu'avec un jeton signé.
      this.logger.warn(
        `Connexion refusée : jeton ${jeton ? 'invalide ou expiré' : 'absent'}`,
      );
      client.disconnect(true);
      return;
    }
    (client.data as DonneesSocket).identite = identite;
    if (identite.estService) {
      this.rejoindrePourUnService(client);
      return;
    }
    this.rejoindreSelonJeton(client, identite);
  }

  /**
   * Salons d'un utilisateur, déduits du jeton vérifié : lui-même, chacun de SES services
   * et son rôle DANS chaque service. Jamais de salon de rôle à l'échelle de la plateforme
   * (il mélangerait les services et les CHU).
   */
  private rejoindreSelonJeton(client: Socket, identite: Identite) {
    client.join(`user:${identite.userId}`);
    for (const s of identite.services) {
      client.join(`service:${s.serviceId}`);
      if (s.roleName)
        client.join(`role:${s.roleName.toLowerCase()}:service:${s.serviceId}`);
    }
    this.connectedUsers.set(identite.userId, {
      name: identite.name ?? '',
      firstname: identite.firstname ?? '',
    });
    const nom =
      [identite.firstname, identite.name].filter(Boolean).join(' ') ||
      identite.userId;
    this.logger.log(
      `🟢 — ${nom} (${identite.userId}) [${this.connectedUsers.size} user(s) 🟢]`,
    );
  }

  /**
   * Backend de la plateforme (jeton de service signé) : il écoute le service qu'il
   * indique (ex. orl_back pour l'ORL, Bloc pour ses prescriptions d'imagerie).
   */
  private rejoindrePourUnService(client: Socket) {
    const serviceId = client.handshake.query.serviceId as string | undefined;
    const role = client.handshake.query.role as string | undefined;
    if (serviceId) client.join(`service:${serviceId}`);
    if (serviceId && role)
      client.join(`role:${role.toLowerCase()}:service:${serviceId}`);
    this.logger.log(
      `Service connecté — écoute service:${serviceId ?? '-'}${role ? ` (rôle ${role})` : ''}`,
    );
  }

  handleDisconnect(client: Socket) {
    // Socket.IO retire lui-même la connexion de tous ses salons.
    const identite = (client.data as DonneesSocket).identite;
    if (!identite || identite.estService) return;
    const user = this.connectedUsers.get(identite.userId);
    const nom = user
      ? [user.firstname, user.name].filter(Boolean).join(' ') || identite.userId
      : identite.userId;
    this.connectedUsers.delete(identite.userId);
    this.logger.log(
      `🔴 — ${nom} (${identite.userId}) [${this.connectedUsers.size} user(s) 🟢]`,
    );
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(client: Socket, userId: string) {
    const identite = (client.data as DonneesSocket).identite;
    if (!identite || (!identite.estService && identite.userId !== userId))
      return;
    client.join(`user:${userId}`);
  }

  @SubscribeMessage('subscribeService')
  handleSubscribeService(client: Socket, serviceId: string) {
    const identite = (client.data as DonneesSocket).identite;
    if (
      !identite ||
      (!identite.estService && !serviceDuJeton(identite, serviceId))
    )
      return;
    client.join(`service:${serviceId}`);
  }

  sendToService(serviceId: string, notification: any) {
    const room = `service:${serviceId}`;
    this.logger.log(`Socket → ${room}: titre="${notification.title}"`);
    this.server.to(room).emit('notification', notification);
  }

  sendToRole(role: string, notification: any) {
    const room = `role:${role.toLowerCase()}`;
    this.logger.log(`Socket → ${room}: titre="${notification.title}"`);
    this.server.to(room).emit('notification', notification);
  }

  sendToRoleAndService(role: string, serviceId: string, notification: any) {
    const room = `role:${role.toLowerCase()}:service:${serviceId}`;
    this.logger.log(`Socket → ${room}: titre="${notification.title}"`);
    this.server.to(room).emit('notification', notification);
  }

  sendNotification(userId: string, notification: any) {
    const room = `user:${userId}`;
    let connected = 0;
    try {
      const ns = this.server.of('/notifications');
      const roomSockets = ns.adapter?.rooms?.get(room);
      connected = roomSockets ? roomSockets.size : 0;
    } catch {
      // adapter pas encore prêt
    }
    this.logger.log(
      `Socket → ${room}: titre="${notification.title}" (${connected} socket(s) dans la salle)`,
    );
    this.server.to(room).emit('notification', notification);
  }

  broadcastNotification(notification: any) {
    this.logger.log(`Socket → broadcast: titre="${notification.title}"`);
    this.server.emit('notification', notification);
  }

  getConnectedUsers(): { userId: string; name: string; firstname: string }[] {
    return Array.from(this.connectedUsers.entries()).map(([userId, info]) => ({
      userId,
      ...info,
    }));
  }
}
