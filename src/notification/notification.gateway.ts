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
    const role = client.handshake.query.role as string;
    const serviceId = client.handshake.query.serviceId as string;
    const userName = (client.handshake.query.userName as string) || '';
    const userFirstname = (client.handshake.query.userFirstname as string) || '';

    if (userId) {
      client.join(`user:${userId}`);
      const displayName = [userFirstname, userName].filter(Boolean).join(' ') || userId;
      this.connectedUsers.set(userId, { name: userName, firstname: userFirstname });
      this.logger.log(`🟢 — ${displayName} (${userId}) [${this.connectedUsers.size} user(s) 🟢]`);
    }

    if (role) {
      client.join(`role:${role}`);
      this.logger.log(`Role room joint — role:${role} pour ${userId || 'anonyme'}`);
    }

    if (serviceId) {
      client.join(`service:${serviceId}`);
      this.logger.log(`Service room joint — service:${serviceId} pour ${userId || 'anonyme'}`);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.handshake.query.userId as string;
    const role = client.handshake.query.role as string;
    if (userId) {
      client.leave(`user:${userId}`);
      const user = this.connectedUsers.get(userId);
      const displayName = user
        ? [user.firstname, user.name].filter(Boolean).join(' ') || userId
        : userId;
      this.connectedUsers.delete(userId);
      this.logger.log(`🔴 — ${displayName} (${userId}) [${this.connectedUsers.size} user(s) 🟢]`);
    }

    if (role) {
      client.leave(`role:${role}`);
    }

    const serviceId = client.handshake.query.serviceId as string;
    if (serviceId) {
      client.leave(`service:${serviceId}`);
    }
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(client: Socket, userId: string) {
    client.join(`user:${userId}`);
  }

  @SubscribeMessage('subscribeService')
  handleSubscribeService(client: Socket, serviceId: string) {
    client.join(`service:${serviceId}`);
  }

  sendToService(serviceId: string, notification: any) {
    const room = `service:${serviceId}`;
    this.logger.log(`Socket → ${room}: titre="${notification.title}"`);
    this.server.to(room).emit('notification', notification);
  }

  sendToRole(role: string, notification: any) {
    const room = `role:${role}`;
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
