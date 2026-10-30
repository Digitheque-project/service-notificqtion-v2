import { createHmac, timingSafeEqual } from 'crypto';

/** Entrée services[] du jeton d'un utilisateur (service, rôle, CHU). */
export interface ServiceDuJeton {
  serviceId: string;
  serviceName?: string;
  roleName?: string;
  chu?: { id?: string };
}

/** Appelant authentifié : un utilisateur, ou un service de la plateforme. */
export interface Identite {
  userId: string;
  name?: string;
  firstname?: string;
  /** Jeton de service (appel entre services, sans utilisateur). */
  estService: boolean;
  services: ServiceDuJeton[];
}

export function extraireJeton(entete?: string | string[]): string | null {
  const valeur = Array.isArray(entete) ? entete[0] : entete;
  if (!valeur?.startsWith('Bearer ')) return null;
  return valeur.slice('Bearer '.length).trim() || null;
}

/**
 * Vérifie un jeton HS256 signé avec le secret commun de la plateforme (JWT_SECRET) :
 * signature et expiration. null si le jeton est absent, falsifié ou expiré.
 */
export function verifierJeton(jeton: string, secret: string): Identite | null {
  const parties = jeton.split('.');
  if (parties.length !== 3) return null;
  const [entete, corps, signature] = parties;
  try {
    const alg = (
      JSON.parse(Buffer.from(entete, 'base64url').toString('utf8')) as {
        alg?: string;
      }
    ).alg;
    if (alg !== 'HS256') return null;
    const attendue = createHmac('sha256', secret)
      .update(`${entete}.${corps}`)
      .digest();
    const recue = Buffer.from(signature, 'base64url');
    if (recue.length !== attendue.length || !timingSafeEqual(recue, attendue))
      return null;

    const payload = JSON.parse(
      Buffer.from(corps, 'base64url').toString('utf8'),
    ) as {
      userId?: string;
      sub?: string;
      name?: string;
      firstname?: string;
      role?: string;
      exp?: number;
      services?: ServiceDuJeton[];
    };
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    const userId = payload.userId ?? payload.sub;
    if (!userId) return null;
    const services = Array.isArray(payload.services) ? payload.services : [];
    return {
      userId,
      name: payload.name,
      firstname: payload.firstname,
      estService: payload.role === 'SERVICE' && services.length === 0,
      services,
    };
  } catch {
    return null;
  }
}

/** Entrée du jeton pour ce service, si l'utilisateur en fait partie. */
export function serviceDuJeton(
  identite: Identite,
  serviceId?: string,
): ServiceDuJeton | undefined {
  return serviceId
    ? identite.services.find((s) => s.serviceId === serviceId)
    : undefined;
}
