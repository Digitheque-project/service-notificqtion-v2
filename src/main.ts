import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const config = new DocumentBuilder()
    .setTitle('Service de Notification')
    .setDescription(
      'API centralisée de notification temps réel pour les services du CHU. ' +
        'Les autres services envoient leurs notifications via HTTP POST, ' +
        'et les clients les reçoivent instantanément via WebSocket (Socket.IO).',
    )
    .setVersion('1.0')
    .addTag('Notifications', 'Gestion des notifications en temps réel')
    .addServer('http://localhost:3000', 'Serveur de développement')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.log(`Documentation Swagger : http://localhost:${port}/api/docs`);
}
bootstrap();
