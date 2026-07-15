import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateNotificationDto {
  @ApiProperty({
    description: 'Identifiant de l\'utilisateur destinataire',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    description: 'Titre de la notification',
    example: 'Nouveau message',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'Contenu de la notification',
    example: 'Vous avez reçu un nouveau message de Dr. Dupont',
  })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({
    description: 'Type de notification',
    example: 'info',
    default: 'info',
  })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({
    description: 'Service émetteur',
    example: 'service-consultation',
  })
  @IsString()
  @IsOptional()
  source?: string;

  @ApiPropertyOptional({
    description: 'Données supplémentaires (JSON)',
    example: { consultationId: 123, doctorName: 'Dr. Dupont' },
  })
  @IsOptional()
  data?: Record<string, any>;
}
