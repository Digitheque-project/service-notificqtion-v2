import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class BroadcastNotificationDto {
  @ApiProperty({
    description: 'Titre de la notification',
    example: 'Nouvelle prescription',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'Contenu de la notification',
    example: 'Une nouvelle prescription est arrivée.',
  })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({
    description: 'Type de notification',
    example: 'new_prescription',
    default: 'info',
  })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({
    description: 'Service émetteur',
    example: 'prescription',
  })
  @IsString()
  @IsOptional()
  source?: string;

  @ApiPropertyOptional({
    description: 'Données supplémentaires (JSON)',
  })
  @IsOptional()
  data?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Priorité de la notification',
    enum: ['normal', 'urgent', 'critical'],
    default: 'normal',
  })
  @IsString()
  @IsOptional()
  priority?: string;
}
