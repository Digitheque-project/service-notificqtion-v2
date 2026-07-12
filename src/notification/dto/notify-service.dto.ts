import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class NotifyServiceDto {
  @ApiProperty({
    description: 'Identifiant du service destinataire',
    example: '75f995a2-40e9-4285-84e4-a72501d37bfd',
  })
  @IsUUID()
  @IsNotEmpty()
  serviceId!: string;

  @ApiProperty({
    description: 'Titre de la notification',
    example: 'Nouvelle demande d\'hospitalisation',
  })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({
    description: 'Contenu de la notification',
    example: 'Une nouvelle demande pour le patient xxx arrive dans votre service.',
  })
  @IsString()
  @IsNotEmpty()
  message!: string;

  @ApiPropertyOptional({
    description: 'Type de notification',
    example: 'demande_created',
    default: 'info',
  })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({
    description: 'Service émetteur',
    example: 'hospitalisation-back',
  })
  @IsString()
  @IsOptional()
  source?: string;

  @ApiPropertyOptional({
    description: 'Données supplémentaires (JSON)',
    example: { demandeId: 'xxx', patientId: 'yyy' },
  })
  @IsOptional()
  data?: Record<string, any>;
}
