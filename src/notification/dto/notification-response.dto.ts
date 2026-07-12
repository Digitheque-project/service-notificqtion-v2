import { ApiProperty } from '@nestjs/swagger';

export class NotificationResponseDto {
  @ApiProperty({ description: 'Identifiant unique de la notification' })
  id: string;

  @ApiProperty({ description: 'Identifiant de l\'utilisateur destinataire' })
  userId: string;

  @ApiProperty({ description: 'Titre de la notification' })
  title: string;

  @ApiProperty({ description: 'Contenu de la notification' })
  message: string;

  @ApiProperty({ description: 'Type de notification', example: 'info' })
  type: string;

  @ApiProperty({ description: 'Service émetteur', example: 'service-consultation' })
  source: string;

  @ApiProperty({ description: 'Données supplémentaires', required: false })
  data?: Record<string, any>;

  @ApiProperty({ description: 'Date de création' })
  createdAt: Date;

  @ApiProperty({ description: 'Notification lue', example: false })
  read: boolean;
}
