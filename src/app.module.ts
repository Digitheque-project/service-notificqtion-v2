import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { NotificationModule } from './notification/notification.module';
import { AuthGuard } from './auth/auth.guard';

@Module({
  imports: [NotificationModule],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
