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

/**
 * Passera à true quand tous les fronts envoient leur jeton (auth.token) : les connexions
 * sans jeton seront alors refusées.
 */
const JETON_SOCKET_OBLIGATOIRE = false;

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

    if (jeton && !identite) {
      this.logger.warn('Connexion refusée : jeton invalide ou expiré');
      client.disconnect(true);
      return;
    }
    if (identite) {
      this.rejoindreSelonJeton(client, identite);
      return;
    }
    if (JETON_SOCKET_OBLIGATOIRE) {
      this.logger.warn('Connexion refusée : jeton absent');
      client.disconnect(true);
      return;
    }
    // Transition : anciens fronts sans jeton (salons choisis par le client). À retirer dès
    // que tous les fronts envoient leur jeton (JETON_SOCKET_OBLIGATOIRE).
    this.logger.warn(
      `Connexion SANS jeton (ancien front) — userId=${String(client.handshake.query.userId ?? '')}`,
    );
    this.rejoindreSelonRequete(client);
  }

  /**
   * Salons déduits du jeton vérifié : l'utilisateur, chacun de SES services et son rôle
   * DANS chaque service. Jamais de salon de rôle à l'échelle de la plateforme (il
   * mélangerait les services et les CHU).
   */
  private rejoindreSelonJeton(client: Socket, identite: Identite) {
    (client.data as DonneesSocket).identite = identite;
    if (identite.estService) return;
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

  /** Ancien comportement (transition) : salons lus dans la requête. */
  private rejoindreSelonRequete(client: Socket) {
    const userId = client.handshake.query.userId as string;
    const role = client.handshake.query.role as string;
    const serviceId = client.handshake.query.serviceId as string;
    const userName = (client.handshake.query.userName as string) || '';
    const userFirstname =
      (client.handshake.query.userFirstname as string) || '';
    if (userId) {
      client.join(`user:${userId}`);
      this.connectedUsers.set(userId, {
        name: userName,
        firstname: userFirstname,
      });
    }
    if (role) client.join(`role:${role.toLowerCase()}`);
    if (serviceId) client.join(`service:${serviceId}`);
    if (role && serviceId)
      client.join(`role:${role.toLowerCase()}:service:${serviceId}`);
  }

  handleDisconnect(client: Socket) {
    // Socket.IO retire lui-même la connexion de tous ses salons.
    const identite = (client.data as DonneesSocket).identite;
    const userId =
      identite?.userId ?? (client.handshake.query.userId as string);
    if (!userId) return;
    const user = this.connectedUsers.get(userId);
    const nom = user
      ? [user.firstname, user.name].filter(Boolean).join(' ') || userId
      : userId;
    this.connectedUsers.delete(userId);
    this.logger.log(
      `🔴 — ${nom} (${userId}) [${this.connectedUsers.size} user(s) 🟢]`,
    );
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(client: Socket, userId: string) {
    const identite = (client.data as DonneesSocket).identite;
    if (identite ? identite.userId !== userId : JETON_SOCKET_OBLIGATOIRE)
      return;
    client.join(`user:${userId}`);
  }

  @SubscribeMessage('subscribeService')
  handleSubscribeService(client: Socket, serviceId: string) {
    const identite = (client.data as DonneesSocket).identite;
    if (
      identite ? !serviceDuJeton(identite, serviceId) : JETON_SOCKET_OBLIGATOIRE
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
