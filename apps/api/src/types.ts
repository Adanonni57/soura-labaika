export const roles = ['ELEVE', 'PROFESSEUR', 'ADMINISTRATION', 'ADMIN_PRINCIPAL'] as const;
export type Role = typeof roles[number];
export type SpaceType = 'CLASSE' | 'MATIERE' | 'GENERAL_ELEVES' | 'PERSONNEL' | 'PRIVE_ADULTES' | 'INTERPELLATION';
export interface Principal { userId: string; etablissementId: string; role: Role; sessionId: string; }

declare module 'fastify' {
  interface FastifyRequest { principal?: Principal }
  interface FastifyContextConfig { public?: boolean }
}
