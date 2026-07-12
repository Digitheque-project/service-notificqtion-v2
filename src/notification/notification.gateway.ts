import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/notifications',
})
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NotificationGateway.name);
  private connectedUsers = new Map<string, { name: string; firstname: string }>();

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;
    const userName = (client.handshake.query.userName as string) || '';
    const userFirstname = (client.handshake.query.userFirstname as string) || '';

    if (userId) {
      client.join(`user:${userId}`);
      const displayName = [userFirstname, userName].filter(Boolean).join(' ') || userId;
      this.connectedUsers.set(userId, { name: userName, firstname: userFirstname });
      this.logger.log(`Connecté — ${displayName} (${userId}) [${this.connectedUsers.size} utilisateur(s) connecté(s)]`);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.handshake.query.userId as string;
    if (userId) {
      client.leave(`user:${userId}`);
      const user = this.connectedUsers.get(userId);
      const displayName = user
        ? [user.firstname, user.name].filter(Boolean).join(' ') || userId
        : userId;
      this.connectedUsers.delete(userId);
      this.logger.log(`Déconnecté — ${displayName} (${userId}) [${this.connectedUsers.size} utilisateur(s) restant(s)]`);
    }
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(client: Socket, userId: string) {
    client.join(`user:${userId}`);
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
    this.logger.log(`Socket → ${room}: titre="${notification.title}" (${connected} socket(s) dans la salle)`);
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
