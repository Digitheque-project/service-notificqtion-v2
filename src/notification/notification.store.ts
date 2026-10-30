import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Pool } from 'pg';

/** Notification telle qu'elle est conservée en base. */
export interface StoredNotification {
  id: string;
  /** Destinataire : un utilisateur, ou une clé de diffusion (broadcast:service:…). */
  userId: string;
  title: string;
  message: string;
  type: string;
  source: string;
  data?: Record<string, any>;
  createdAt: Date;
  /** Lue : par son destinataire unique, ou (lecture) par l'utilisateur demandeur. */
  read: boolean;
  priority: string;
}

/** Ligne de la table, `lu` déjà résolu pour l'utilisateur demandeur. */
type Ligne = {
  id: string;
  destinataire: string;
  titre: string;
  message: string;
  type: string;
  source: string;
  donnees: Record<string, any> | null;
  priorite: string;
  cree_le: Date;
  lu: boolean;
};

/** Plafond par lecture : au-delà, les plus anciennes restent en base sans être renvoyées. */
const LIMITE_LECTURE = 500;

/**
 * Persistance des notifications dans PostgreSQL (schéma `notification`).
 *
 * Remplace le fichier JSON (effacé à chaque redémarrage sur Render, et rechargé en
 * entier en mémoire) : chaque lecture est une requête ciblée et indexée par
 * destinataire et par date, pour tenir des années d'historique. Les accusés de lecture
 * des notifications diffusées (service, rôle) sont personnels : table `lectures`.
 */
@Injectable()
export class NotificationStore implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationStore.name);
  private readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000,
    ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '')
      ? undefined
      : { rejectUnauthorized: false },
  });

  async onModuleInit(): Promise<void> {
    if (!process.env.DATABASE_URL) {
      this.logger.error(
        'DATABASE_URL manquante : les notifications ne peuvent pas être conservées.',
      );
      return;
    }
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id uuid PRIMARY KEY,
        destinataire text NOT NULL,
        titre text NOT NULL,
        message text NOT NULL,
        type text NOT NULL DEFAULT 'info',
        source text NOT NULL DEFAULT 'system',
        donnees jsonb,
        priorite text NOT NULL DEFAULT 'normal',
        lu boolean NOT NULL DEFAULT false,
        cree_le timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS notifications_destinataire_date
        ON notifications (destinataire, cree_le DESC);
      CREATE INDEX IF NOT EXISTS notifications_date ON notifications (cree_le DESC);
      CREATE TABLE IF NOT EXISTS lectures (
        notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
        utilisateur text NOT NULL,
        lu_le timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (notification_id, utilisateur)
      );
    `);
    this.logger.log('Base des notifications prête.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async inserer(n: StoredNotification): Promise<void> {
    await this.pool.query(
      `INSERT INTO notifications (id, destinataire, titre, message, type, source, donnees, priorite, lu, cree_le)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        n.id,
        n.userId,
        n.title,
        n.message,
        n.type,
        n.source,
        n.data ?? null,
        n.priority,
        n.read,
        n.createdAt,
      ],
    );
  }

  /** Notifications de ces destinataires, `read` résolu pour `lecteur` (plus récentes d'abord). */
  async parDestinataires(
    destinataires: string[],
    lecteur?: string,
  ): Promise<StoredNotification[]> {
    const { rows } = await this.pool.query<Ligne>(
      `SELECT n.id, n.destinataire, n.titre, n.message, n.type, n.source, n.donnees,
              n.priorite, n.cree_le,
              (n.lu OR EXISTS (SELECT 1 FROM lectures l
                                WHERE l.notification_id = n.id AND l.utilisateur = $2)) AS lu
         FROM notifications n
        WHERE n.destinataire = ANY($1)
        ORDER BY n.cree_le DESC
        LIMIT ${LIMITE_LECTURE}`,
      [destinataires, lecteur ?? ''],
    );
    return rows.map(versNotification);
  }

  /** Les plus récentes, tous destinataires confondus (réservé aux services). */
  async recentes(): Promise<StoredNotification[]> {
    const { rows } = await this.pool.query<Ligne>(
      `SELECT * FROM notifications ORDER BY cree_le DESC LIMIT ${LIMITE_LECTURE}`,
    );
    return rows.map(versNotification);
  }

  async trouver(
    id: string,
    lecteur?: string,
  ): Promise<StoredNotification | null> {
    const { rows } = await this.pool.query<Ligne>(
      `SELECT n.id, n.destinataire, n.titre, n.message, n.type, n.source, n.donnees,
              n.priorite, n.cree_le,
              (n.lu OR EXISTS (SELECT 1 FROM lectures l
                                WHERE l.notification_id = n.id AND l.utilisateur = $2)) AS lu
         FROM notifications n WHERE n.id = $1`,
      [id, lecteur ?? ''],
    );
    return rows[0] ? versNotification(rows[0]) : null;
  }

  /**
   * Accusés de lecture. Avec un utilisateur : accusé PERSONNEL (les collègues d'une
   * notification diffusée gardent leur indice), et global s'il en est le destinataire
   * unique. Sans utilisateur (appel d'un service) : lue pour tout le monde.
   * Retourne le nombre de notifications existantes concernées.
   */
  async marquerLues(ids: string[], lecteur?: string): Promise<number> {
    if (ids.length === 0) return 0;
    const existantes = await this.pool.query<{ id: string }>(
      `SELECT id FROM notifications WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    const trouvees = existantes.rows.map((r) => r.id);
    if (trouvees.length === 0) return 0;
    if (!lecteur) {
      await this.pool.query(
        `UPDATE notifications SET lu = true WHERE id = ANY($1::uuid[])`,
        [trouvees],
      );
      return trouvees.length;
    }
    await this.pool.query(
      `INSERT INTO lectures (notification_id, utilisateur)
       SELECT unnest($1::uuid[]), $2 ON CONFLICT DO NOTHING`,
      [trouvees, lecteur],
    );
    await this.pool.query(
      `UPDATE notifications SET lu = true
        WHERE id = ANY($1::uuid[]) AND destinataire = $2`,
      [trouvees, lecteur],
    );
    return trouvees.length;
  }

  async supprimerDestinataire(destinataire: string): Promise<number> {
    const r = await this.pool.query(
      `DELETE FROM notifications WHERE destinataire = $1`,
      [destinataire],
    );
    return r.rowCount ?? 0;
  }

  /** Retire les notifications plus anciennes que `jours` (0 = tout conserver). */
  async purger(jours: number): Promise<number> {
    if (jours <= 0) return 0;
    const r = await this.pool.query(
      `DELETE FROM notifications WHERE cree_le < now() - make_interval(days => $1)`,
      [jours],
    );
    return r.rowCount ?? 0;
  }
}

function versNotification(l: Ligne): StoredNotification {
  return {
    id: l.id,
    userId: l.destinataire,
    title: l.titre,
    message: l.message,
    type: l.type,
    source: l.source,
    data: l.donnees ?? undefined,
    priority: l.priorite,
    createdAt: new Date(l.cree_le),
    read: l.lu,
  };
}
