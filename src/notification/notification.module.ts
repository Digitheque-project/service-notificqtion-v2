import { Module } from '@nestjs/common';
import { NotificationGateway } from './notification.gateway';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { NotificationStore } from './notification.store';

@Module({
  controllers: [NotificationController],
  providers: [NotificationGateway, NotificationService, NotificationStore],
  exports: [NotificationService, NotificationGateway],
})
export class NotificationModule {}
