import { createHmac } from 'crypto';
import { extraireJeton, serviceDuJeton, verifierJeton } from './jeton';

const SECRET = 'secret-de-test';
const b64 = (o: unknown) =>
  Buffer.from(JSON.stringify(o)).toString('base64url');
function signer(payload: Record<string, unknown>, secret = SECRET): string {
  const entete = b64({ alg: 'HS256', typ: 'JWT' });
  const corps = b64(payload);
  const sig = createHmac('sha256', secret)
    .update(`${entete}.${corps}`)
    .digest('base64url');
  return `${entete}.${corps}.${sig}`;
}
const dans = (s: number) => Math.floor(Date.now() / 1000) + s;

describe('verifierJeton', () => {
  const utilisateur = {
    userId: 'u1',
    services: [
      {
        serviceId: 'endo-A',
        serviceName: 'Endoscopie',
        roleName: 'Major',
        chu: { id: 'chu-A' },
      },
    ],
    exp: dans(300),
  };

  it('accepte un jeton utilisateur valide', () => {
    const id = verifierJeton(signer(utilisateur), SECRET);
    expect(id?.userId).toBe('u1');
    expect(id?.estService).toBe(false);
    expect(id && serviceDuJeton(id, 'endo-A')?.roleName).toBe('Major');
    expect(id && serviceDuJeton(id, 'autre-service')).toBeUndefined();
  });

  it('reconnaît un jeton de service', () => {
    const id = verifierJeton(
      signer({
        userId: 'service-endoscopie',
        role: 'SERVICE',
        services: [],
        exp: dans(60),
      }),
      SECRET,
    );
    expect(id?.estService).toBe(true);
  });

  it('refuse un jeton signé avec un autre secret', () => {
    expect(verifierJeton(signer(utilisateur, 'mauvais'), SECRET)).toBeNull();
  });

  it('refuse un jeton dont le contenu a été modifié', () => {
    const [e, , s] = signer(utilisateur).split('.');
    const falsifie = `${e}.${b64({ ...utilisateur, userId: 'u2' })}.${s}`;
    expect(verifierJeton(falsifie, SECRET)).toBeNull();
  });

  it('refuse un jeton expiré', () => {
    expect(
      verifierJeton(signer({ ...utilisateur, exp: dans(-10) }), SECRET),
    ).toBeNull();
  });

  it("un utilisateur qui se dit SERVICE mais porte des services n'est pas un service", () => {
    const id = verifierJeton(
      signer({ ...utilisateur, role: 'SERVICE' }),
      SECRET,
    );
    expect(id?.estService).toBe(false);
  });

  it('extrait le jeton de l’en-tête Bearer', () => {
    expect(extraireJeton('Bearer abc')).toBe('abc');
    expect(extraireJeton('Basic abc')).toBeNull();
    expect(extraireJeton(undefined)).toBeNull();
  });
});
