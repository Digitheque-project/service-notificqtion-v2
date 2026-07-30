import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsOptional, IsString } from 'class-validator';

/**
 * Accuse de lecture d'UNE notification.
 *
 * `userId` est optionnel pour rester compatible avec les appels existants :
 *  - fourni -> l'accuse est PERSONNEL (les autres destinataires d'une
 *    notification diffusee gardent leur indice "non lue") ;
 *  - absent -> comportement historique, la notification devient lue pour tout
 *    le monde.
 */
export class MarkReadDto {
  @ApiPropertyOptional({
    description: "Utilisateur qui accuse reception",
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  @IsOptional()
  userId?: string;
}

/** Accuse de lecture GROUPE : un seul appel pour toute une liste. */
export class MarkManyReadDto {
  @ApiProperty({
    description: 'Identifiants des notifications a marquer comme lues',
    example: ['550e8400-e29b-41d4-a716-446655440000'],
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids: string[];

  @ApiPropertyOptional({
    description: "Utilisateur qui accuse reception (accuse personnel)",
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  @IsOptional()
  userId?: string;
}

/** Accuse de lecture de TOUTES les notifications visibles par un utilisateur. */
export class MarkAllReadDto {
  @ApiPropertyOptional({
    description: 'Role de l utilisateur (notifications diffusees par role)',
    example: 'paramed',
  })
  @IsString()
  @IsOptional()
  role?: string;

  @ApiPropertyOptional({
    description: 'Service de l utilisateur (notifications role + service)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  @IsOptional()
  serviceId?: string;
}

/** Resultat d'un accuse de lecture groupe. */
export class MarkReadResultDto {
  @ApiProperty({ description: 'Nombre de notifications marquees comme lues' })
  updated: number;

  @ApiProperty({
    description: 'Identifiants inconnus (deja purges), ignores silencieusement',
  })
  ignored: number;
}
