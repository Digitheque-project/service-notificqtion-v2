import { Injectable, Logger } from '@nestjs/common';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'fs';
import { dirname, isAbsolute, resolve } from 'path';

/**
 * Notification telle qu'elle est CONSERVEE sur disque.
 *
 * Difference avec NotificationResponseDto : on garde `readBy`, la liste des
 * utilisateurs ayant lu la notification. C'est indispensable pour les
 * notifications diffusees a un role + service (une seule entree partagee par
 * toute l'equipe) : sans cela, le premier infirmier qui ouvre le panneau
 * faisait disparaitre l'indice pour TOUS ses collegues.
 */
export interface StoredNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  source: string;
  data?: Record<string, any>;
  createdAt: Date;
  /**
   * Etat de lecture "global", conserve pour compatibilite avec les appels qui
   * ne transmettent pas d'utilisateur (destinataire unique).
   */
  read: boolean;
  /** Utilisateurs ayant lu cette notification. */
  readBy: string[];
  priority: string;
}

/** Emplacement du fichier de persistance (surchargeable par variable d'env). */
const FICHIER_PAR_DEFAUT = 'data/notifications.json';
/** Les ecritures sont regroupees : une rafale de notifications = une ecriture. */
const DELAI_ECRITURE_MS = 300;

/**
 * Persistance FICHIER des notifications.
 *
 * Le service conservait tout dans un simple tableau en memoire : le moindre
 * redemarrage effacait les notifications ET les accuses de lecture, ce qui
 * faisait reapparaitre l'indice "non lues" cote front. On serialise donc l'etat
 * dans un fichier JSON, ecrit de facon atomique (fichier temporaire + rename)
 * pour ne jamais laisser un fichier tronque derriere soi.
 *
 * Aucune dependance supplementaire n'est requise : si un vrai SGBD est ajoute
 * plus tard, seule cette classe est a remplacer.
 */
@Injectable()
export class NotificationStore {
  private readonly logger = new Logger(NotificationStore.name);
  private readonly fichier: string;
  private minuterie: NodeJS.Timeout | null = null;
  private enAttente: StoredNotification[] | null = null;

  constructor() {
    const configure =
      process.env.NOTIFICATION_STORE_FILE?.trim() || FICHIER_PAR_DEFAUT;
    this.fichier = isAbsolute(configure)
      ? configure
      : resolve(process.cwd(), configure);
  }

  /** Chemin reel du fichier utilise (journalise au demarrage). */
  get chemin(): string {
    return this.fichier;
  }

  /** Relit l'etat persiste. Retourne une liste vide si le fichier est absent. */
  charger(): StoredNotification[] {
    try {
      if (!existsSync(this.fichier)) return [];
      const brut = readFileSync(this.fichier, 'utf8');
      if (!brut.trim()) return [];

      const donnees: unknown = JSON.parse(brut);
      const lignes = Array.isArray(donnees) ? donnees : [];

      return lignes
        .map((ligne) => this.normaliser(ligne as Record<string, unknown>))
        .filter((n): n is StoredNotification => n !== null);
    } catch (erreur) {
      // Fichier illisible ou corrompu : on repart a vide plutot que de bloquer
      // le demarrage du service.
      this.logger.error(
        `Lecture impossible de ${this.fichier} : ${String(erreur)}`,
      );
      return [];
    }
  }

  /** Programme une ecriture (regroupee) de l'etat courant. */
  enregistrer(notifications: StoredNotification[]): void {
    this.enAttente = notifications;
    if (this.minuterie) return;
    this.minuterie = setTimeout(() => {
      this.minuterie = null;
      this.ecrire();
    }, DELAI_ECRITURE_MS);
    // Ne pas maintenir le processus en vie uniquement pour cette minuterie.
    this.minuterie.unref?.();
  }

  /** Force l'ecriture immediate (arret du service). */
  vider(): void {
    if (this.minuterie) {
      clearTimeout(this.minuterie);
      this.minuterie = null;
    }
    this.ecrire();
  }

  private ecrire(): void {
    const notifications = this.enAttente;
    if (!notifications) return;
    this.enAttente = null;

    try {
      mkdirSync(dirname(this.fichier), { recursive: true });
      const temporaire = `${this.fichier}.tmp`;
      writeFileSync(temporaire, JSON.stringify(notifications), 'utf8');
      renameSync(temporaire, this.fichier);
    } catch (erreur) {
      this.logger.error(
        `Ecriture impossible dans ${this.fichier} : ${String(erreur)}`,
      );
    }
  }

  /** Reconstruit une notification depuis le JSON (dates + champs manquants). */
  private normaliser(ligne: Record<string, unknown>): StoredNotification | null {
    if (!ligne || typeof ligne.id !== 'string') return null;

    const creation = new Date(String(ligne.createdAt ?? ''));
    const readBy = Array.isArray(ligne.readBy)
      ? (ligne.readBy as unknown[]).filter(
          (valeur): valeur is string => typeof valeur === 'string',
        )
      : [];

    return {
      id: ligne.id,
      userId: String(ligne.userId ?? ''),
      title: String(ligne.title ?? ''),
      message: String(ligne.message ?? ''),
      type: String(ligne.type ?? 'info'),
      source: String(ligne.source ?? 'system'),
      data: (ligne.data as Record<string, any> | undefined) ?? undefined,
      createdAt: Number.isNaN(creation.getTime()) ? new Date() : creation,
      read: Boolean(ligne.read),
      readBy,
      priority: String(ligne.priority ?? 'normal'),
    };
  }
}
