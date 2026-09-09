import type { Role, SpaceType } from './types.js';

const adult = (role: Role) => role !== 'ELEVE';

export function canInitiatePrivate(actor: Role, target: Role): boolean {
  if (!adult(actor)) return false;
  return adult(target) || target === 'ELEVE';
}

export function canWriteSpace(role: Role, type: SpaceType, isMember: boolean, existingInterpellation = false): boolean {
  if (!isMember && role !== 'ADMIN_PRINCIPAL') return false;
  if (type === 'PRIVE_ADULTES' || type === 'PERSONNEL') return adult(role);
  if (type === 'INTERPELLATION') return adult(role) || existingInterpellation;
  return true;
}

export function canReadSpace(role: Role, isMember: boolean, supervisionWithReason = false): boolean {
  return isMember || (role === 'ADMIN_PRINCIPAL' && supervisionWithReason);
}

export function visibleDirectoryRoles(role: Role): Role[] {
  return role === 'ELEVE' ? ['PROFESSEUR', 'ADMINISTRATION', 'ADMIN_PRINCIPAL'] : [...(['ELEVE','PROFESSEUR','ADMINISTRATION','ADMIN_PRINCIPAL'] as Role[])];
}
