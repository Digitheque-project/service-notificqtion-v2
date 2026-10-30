import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { extraireJeton, Identite, verifierJeton } from './jeton';

export type RequeteAuthentifiee = Request & { identite: Identite };

/**
 * Toute route HTTP exige un jeton signé avec le secret de la plateforme : le service ne
 * se repose plus seulement sur la passerelle (il peut être joint directement). L'identité
 * vérifiée sert ensuite à limiter chacun à SES notifications (voir le contrôleur).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      this.logger.error(
        'JWT_SECRET manquant : toutes les requêtes sont refusées.',
      );
      throw new ServiceUnavailableException(
        'Service de notification mal configuré',
      );
    }
    const requete = context.switchToHttp().getRequest<RequeteAuthentifiee>();
    const jeton = extraireJeton(requete.headers.authorization);
    const identite = jeton ? verifierJeton(jeton, secret) : null;
    if (!identite)
      throw new UnauthorizedException('Jeton manquant, invalide ou expiré');
    requete.identite = identite;
    return true;
  }
}
