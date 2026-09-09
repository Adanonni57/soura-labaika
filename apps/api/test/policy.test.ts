import {describe,expect,it} from 'vitest';
import {canInitiatePrivate,canReadSpace,canWriteSpace,visibleDirectoryRoles} from '../src/policy.js';
describe('matrice des autorisations',()=>{
  it('interdit toute initiation privée par un élève',()=>expect(canInitiatePrivate('ELEVE','PROFESSEUR')).toBe(false));
  it('autorise un adulte à interpeller un élève',()=>expect(canInitiatePrivate('PROFESSEUR','ELEVE')).toBe(true));
  it('autorise la réponse dans une interpellation existante',()=>expect(canWriteSpace('ELEVE','INTERPELLATION',true,true)).toBe(true));
  it('interdit le groupe personnel aux élèves',()=>expect(canWriteSpace('ELEVE','PERSONNEL',true)).toBe(false));
  it('exige motif et rôle admin principal pour superviser',()=>{
    expect(canReadSpace('ADMIN_PRINCIPAL',false,false)).toBe(false);
    expect(canReadSpace('ADMIN_PRINCIPAL',false,true)).toBe(true);
    expect(canReadSpace('PROFESSEUR',false,true)).toBe(false);
  });
  it('limite l’annuaire élève aux adultes',()=>expect(visibleDirectoryRoles('ELEVE')).not.toContain('ELEVE'));
});
