import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import argon2 from 'argon2';
import { z } from 'zod';
import { db, tx } from './db.js';
import { canInitiatePrivate, canReadSpace, canWriteSpace } from './policy.js';
import { opaqueToken, signSession, tokenHash, verifySession } from './security.js';
import type { Role, SpaceType } from './types.js';

const app = Fastify({ logger: { redact: ['req.headers.authorization', 'req.headers.cookie', 'body.password', 'body.token'] }, trustProxy: true, disableRequestLogging: true });
await app.register(helmet, { contentSecurityPolicy: false });
await app.register(cors, { origin: process.env.WEB_ORIGIN?.split(',') ?? ['http://localhost:5173'], credentials: true });
await app.register(cookie);
await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });
app.setErrorHandler((error, _req, reply) => {
  const status = (error as { statusCode?: number }).statusCode ?? 500;
  const message = error instanceof Error ? error.message : 'Requête invalide';
  reply.code(status).send({ error: status === 500 ? 'Erreur interne' : message });
});

app.decorateRequest('principal', undefined);
app.addHook('preHandler', async (req) => {
  if (req.routeOptions.config?.public) return;
  const raw = req.cookies.soura_session ?? req.headers.authorization?.replace(/^Bearer /, '');
  if (!raw) throw fail('Authentification requise', 401);
  const p = await verifySession(raw).catch(() => { throw fail('Session invalide', 401); });
  const active = await db.query('SELECT 1 FROM sessions WHERE id=$1 AND utilisateur_id=$2 AND revoked_at IS NULL AND expires_at>now()', [p.sessionId, p.userId]);
  if (!active.rowCount) throw fail('Session expirée ou révoquée', 401);
  req.principal = p;
});

app.get('/health', { config: { public: true } }, async () => ({ status: 'ok' }));

app.post('/auth/login', { config: { public: true }, preHandler: app.rateLimit({ max: 5, timeWindow: '1 minute' }) }, async (req, reply) => {
  const input = z.object({ identifiant: z.string().min(3).max(80), password: z.string().min(8).max(200) }).parse(req.body);
  const found = await db.query('SELECT id, etablissement_id, role, password_hash, actif, must_change_password FROM utilisateurs WHERE identifiant=$1', [input.identifiant]);
  const user = found.rows[0];
  if (!user?.actif || !(await argon2.verify(user.password_hash, input.password))) throw fail('Identifiants invalides', 401);
  const result = await tx(async c => {
    await c.query("DELETE FROM sessions WHERE utilisateur_id=$1 AND (revoked_at IS NOT NULL OR expires_at<=now())", [user.id]);
    const existing = await c.query('SELECT 1 FROM sessions WHERE utilisateur_id=$1 AND revoked_at IS NULL AND expires_at>now() FOR UPDATE', [user.id]);
    if (existing.rowCount) throw fail('Compte déjà connecté ailleurs', 409);
    return c.query("INSERT INTO sessions(utilisateur_id, expires_at) VALUES($1, now() + ($2 || ' minutes')::interval) RETURNING id", [user.id, Number(process.env.SESSION_TTL_MINUTES ?? 30)]);
  });
  const token = await signSession({ userId: user.id, etablissementId: user.etablissement_id, role: user.role, sessionId: result.rows[0].id });
  reply.setCookie('soura_session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: Number(process.env.SESSION_TTL_MINUTES ?? 30) * 60 });
  return { role: user.role, mustChangePassword: user.must_change_password ?? false, token };
});

app.post('/auth/logout', async (req, reply) => {
  await db.query('UPDATE sessions SET revoked_at=now() WHERE id=$1', [req.principal!.sessionId]);
  reply.clearCookie('soura_session', { path: '/' }); return { ok: true };
});

app.post('/auth/change-password', async req => {
  const {currentPassword,newPassword}=z.object({currentPassword:z.string().min(8),newPassword:z.string().min(12).max(200)}).parse(req.body);
  const user=await db.query('SELECT password_hash FROM utilisateurs WHERE id=$1',[req.principal!.userId]);
  if(!user.rowCount || !(await argon2.verify(user.rows[0].password_hash,currentPassword))) throw fail('Mot de passe actuel incorrect',401);
  const hash=await argon2.hash(newPassword,{type:argon2.argon2id,memoryCost:Number(process.env.ARGON2_MEMORY_KIB??65536),timeCost:Number(process.env.ARGON2_TIME_COST??3)});
  await tx(async c=>{await c.query('UPDATE utilisateurs SET password_hash=$1,must_change_password=false WHERE id=$2',[hash,req.principal!.userId]);await c.query('UPDATE sessions SET revoked_at=now() WHERE utilisateur_id=$1 AND id<>$2',[req.principal!.userId,req.principal!.sessionId]);});
  return {ok:true};
});

app.get('/me', async req => {
  const r = await db.query('SELECT id, identifiant, nom_affichage, role, classe_id FROM utilisateurs WHERE id=$1', [req.principal!.userId]);
  return r.rows[0];
});

app.get('/spaces', async req => {
  const p = req.principal!;
  const r = await db.query(`SELECT e.id,e.nom,e.type FROM espaces e JOIN espace_membres m ON m.espace_id=e.id
    WHERE m.utilisateur_id=$1 AND e.etablissement_id=$2 ORDER BY e.nom`, [p.userId, p.etablissementId]);
  return r.rows;
});

app.get('/spaces/:id/messages', async req => {
  const p = req.principal!; const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const query = z.object({ motif: z.string().min(10).max(500).optional() }).parse(req.query);
  const space = await db.query(`SELECT e.*, EXISTS(SELECT 1 FROM espace_membres WHERE espace_id=e.id AND utilisateur_id=$2) membre
    FROM espaces e WHERE e.id=$1 AND e.etablissement_id=$3`, [id,p.userId,p.etablissementId]);
  if (!space.rowCount) throw fail('Espace introuvable',404);
  const s=space.rows[0];
  const needsSupervision=p.role==='ADMIN_PRINCIPAL'&&['CLASSE','MATIERE','GENERAL_ELEVES'].includes(s.type);
  const supervised=needsSupervision&&!!query.motif;
  if ((needsSupervision&&!supervised)||(!needsSupervision&&!canReadSpace(p.role,s.membre,false))) throw fail(needsSupervision?'Motif de supervision obligatoire':'Accès refusé',403);
  if (supervised) await db.query('INSERT INTO audit(etablissement_id,acteur_id,action,cible_id,motif) VALUES($1,$2,$3,$4,$5)',[p.etablissementId,p.userId,'SUPERVISION_LECTURE',id,query.motif]);
  const messages=await db.query(`SELECT m.id,m.contenu,m.created_at,u.nom_affichage auteur FROM messages m JOIN utilisateurs u ON u.id=m.auteur_id
    WHERE m.espace_id=$1 AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 100`,[id]);
  return messages.rows.reverse();
});

app.post('/spaces/:id/messages', async req => {
  const p=req.principal!; const {id}=z.object({id:z.string().uuid()}).parse(req.params);
  const {contenu,reponse_a}=z.object({contenu:z.string().trim().min(1).max(4000),reponse_a:z.string().uuid().optional()}).parse(req.body);
  const r=await db.query(`SELECT e.type,e.ecriture_fermee, EXISTS(SELECT 1 FROM espace_membres WHERE espace_id=e.id AND utilisateur_id=$2) membre
    FROM espaces e WHERE e.id=$1 AND e.etablissement_id=$3`,[id,p.userId,p.etablissementId]);
  if(!r.rowCount || (r.rows[0].ecriture_fermee&&p.role==='ELEVE') || !canWriteSpace(p.role,r.rows[0].type as SpaceType,r.rows[0].membre,r.rows[0].type==='INTERPELLATION')) throw fail('Écriture interdite',403);
  const inserted=await db.query('INSERT INTO messages(etablissement_id,espace_id,auteur_id,contenu,reponse_a) VALUES($1,$2,$3,$4,$5) RETURNING id,contenu,created_at',[p.etablissementId,id,p.userId,contenu,reponse_a??null]);
  return inserted.rows[0];
});

app.post('/private/interpellations', async req => {
  const p=req.principal!; const {eleveId,contenu}=z.object({eleveId:z.string().uuid(),contenu:z.string().min(1).max(4000)}).parse(req.body);
  const target=await db.query('SELECT role,etablissement_id,nom_affichage FROM utilisateurs WHERE id=$1',[eleveId]);
  if(!target.rowCount || target.rows[0].etablissement_id!==p.etablissementId || target.rows[0].role!=='ELEVE' || !canInitiatePrivate(p.role,target.rows[0].role as Role)) throw fail('Interpellation interdite',403);
  return tx(async c=>{
    const e=await c.query("INSERT INTO espaces(etablissement_id,nom,type,cree_par) VALUES($1,$2,'INTERPELLATION',$3) RETURNING id",[p.etablissementId,`Interpellation — ${target.rows[0].nom_affichage}`,p.userId]);
    await c.query('INSERT INTO espace_membres(espace_id,utilisateur_id) VALUES($1,$2),($1,$3)',[e.rows[0].id,p.userId,eleveId]);
    await c.query('INSERT INTO messages(etablissement_id,espace_id,auteur_id,contenu) VALUES($1,$2,$3,$4)',[p.etablissementId,e.rows[0].id,p.userId,contenu]);
    return {id:e.rows[0].id};
  });
});

app.delete('/messages/:id', async req=>{
  const p=req.principal!;const{id}=z.object({id:z.string().uuid()}).parse(req.params);
  const check=await db.query(`SELECT m.auteur_id,e.id espace_id,em.peut_moderer FROM messages m JOIN espaces e ON e.id=m.espace_id
    LEFT JOIN espace_membres em ON em.espace_id=e.id AND em.utilisateur_id=$2 WHERE m.id=$1 AND m.etablissement_id=$3`,[id,p.userId,p.etablissementId]);
  if(!check.rowCount || (check.rows[0].auteur_id!==p.userId && p.role!=='ADMIN_PRINCIPAL' && !check.rows[0].peut_moderer))throw fail('Suppression interdite',403);
  await db.query('UPDATE messages SET deleted_at=now(),deleted_by=$1 WHERE id=$2',[p.userId,id]);
  await db.query('INSERT INTO audit(etablissement_id,acteur_id,action,cible_id) VALUES($1,$2,$3,$4)',[p.etablissementId,p.userId,'SUPPRESSION_MESSAGE',id]);return{ok:true};
});

app.post('/messages/:id/report',async req=>{const p=req.principal!;const{id}=z.object({id:z.string().uuid()}).parse(req.params);const{motif}=z.object({motif:z.string().min(5).max(500)}).parse(req.body);
  const visible=await db.query(`SELECT 1 FROM messages m JOIN espace_membres em ON em.espace_id=m.espace_id WHERE m.id=$1 AND em.utilisateur_id=$2 AND m.etablissement_id=$3`,[id,p.userId,p.etablissementId]);if(!visible.rowCount)throw fail('Message inaccessible',404);
  await db.query('INSERT INTO signalements(etablissement_id,message_id,signale_par,motif) VALUES($1,$2,$3,$4) ON CONFLICT(message_id,signale_par) DO UPDATE SET motif=excluded.motif',[p.etablissementId,id,p.userId,motif]);return{ok:true};
});

app.put('/messages/:id/reactions/:emoji',async req=>{const p=req.principal!;const{id,emoji}=z.object({id:z.string().uuid(),emoji:z.enum(['👍','❤️','👏','✅','🙏'])}).parse(req.params);
  const visible=await db.query('SELECT 1 FROM messages m JOIN espace_membres em ON em.espace_id=m.espace_id WHERE m.id=$1 AND em.utilisateur_id=$2 AND m.etablissement_id=$3',[id,p.userId,p.etablissementId]);if(!visible.rowCount)throw fail('Message inaccessible',404);
  await db.query('INSERT INTO reactions(message_id,utilisateur_id,emoji) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,p.userId,emoji]);return{ok:true};
});

app.post('/ideas/token', { preHandler: app.rateLimit({ max: 3, timeWindow: '1 hour' }) }, async req => {
  const raw=opaqueToken();
  await db.query("INSERT INTO idee_jetons(token_hash,etablissement_id,expires_at) VALUES($1,$2,now()+interval '10 minutes')",[tokenHash(raw),req.principal!.etablissementId]);
  return {token:raw,expiresInSeconds:600};
});

app.post('/ideas', { config:{public:true}, preHandler: app.rateLimit({max:5,timeWindow:'1 hour'}) }, async req => {
  const {token,contenu}=z.object({token:z.string().min(30),contenu:z.string().trim().min(10).max(4000)}).parse(req.body);
  return tx(async c=>{
    const used=await c.query('DELETE FROM idee_jetons WHERE token_hash=$1 AND expires_at>now() RETURNING etablissement_id',[tokenHash(token)]);
    if(!used.rowCount) throw fail('Jeton invalide ou expiré',401);
    const suivi=opaqueToken(12); await c.query('INSERT INTO idees(etablissement_id,contenu,code_suivi_hash) VALUES($1,$2,$3)',[used.rows[0].etablissement_id,contenu,tokenHash(suivi)]);
    return {codeSuivi:suivi};
  });
});

app.get('/ideas/responses/:code', {config:{public:true}}, async req=>{
  const {code}=z.object({code:z.string().min(10)}).parse(req.params);
  const r=await db.query('SELECT contenu,reponse,answered_at FROM idees WHERE code_suivi_hash=$1 AND reponse IS NOT NULL',[tokenHash(code)]);
  return r.rows[0]??null;
});

app.get('/admin/ideas', async req=>{
  if(req.principal!.role!=='ADMIN_PRINCIPAL') throw fail('Accès refusé',403);
  return (await db.query('SELECT id,contenu,reponse,created_at,answered_at FROM idees WHERE etablissement_id=$1 ORDER BY created_at DESC',[req.principal!.etablissementId])).rows;
});

app.get('/admin/sessions', async req=>{
  const p=req.principal!; if(p.role!=='ADMIN_PRINCIPAL') throw fail('Accès refusé',403);
  return (await db.query(`SELECT s.id,s.created_at,s.expires_at,u.nom_affichage,u.identifiant FROM sessions s JOIN utilisateurs u ON u.id=s.utilisateur_id
    WHERE u.etablissement_id=$1 AND s.revoked_at IS NULL AND s.expires_at>now() ORDER BY s.created_at DESC`,[p.etablissementId])).rows;
});

app.delete('/admin/sessions/:id', async req=>{
  const p=req.principal!; if(p.role!=='ADMIN_PRINCIPAL') throw fail('Accès refusé',403);
  const {id}=z.object({id:z.string().uuid()}).parse(req.params);
  const r=await db.query(`UPDATE sessions s SET revoked_at=now() FROM utilisateurs u WHERE s.id=$1 AND s.utilisateur_id=u.id AND u.etablissement_id=$2 RETURNING s.id`,[id,p.etablissementId]);
  if(!r.rowCount)throw fail('Session introuvable',404);await db.query('INSERT INTO audit(etablissement_id,acteur_id,action,cible_id) VALUES($1,$2,$3,$4)',[p.etablissementId,p.userId,'REVOCATION_SESSION',id]);return{ok:true};
});

app.post('/admin/users', async req=>{
  const p=req.principal!; if(p.role!=='ADMIN_PRINCIPAL') throw fail('Accès refusé',403);
  const input=z.object({identifiant:z.string().min(3).max(80),nomAffichage:z.string().min(2).max(120),role:z.enum(['ELEVE','PROFESSEUR','ADMINISTRATION','ADMIN_PRINCIPAL']),classeId:z.string().uuid().nullable().optional(),motDePasseInitial:z.string().min(12).max(200)}).parse(req.body);
  if(input.role==='ELEVE'&&!input.classeId)throw fail('Une classe est obligatoire pour un élève');
  const hash=await argon2.hash(input.motDePasseInitial,{type:argon2.argon2id,memoryCost:Number(process.env.ARGON2_MEMORY_KIB??65536),timeCost:Number(process.env.ARGON2_TIME_COST??3)});
  const r=await db.query('INSERT INTO utilisateurs(etablissement_id,classe_id,identifiant,nom_affichage,role,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,identifiant,nom_affichage,role',[p.etablissementId,input.classeId??null,input.identifiant,input.nomAffichage,input.role,hash]);
  await db.query('INSERT INTO audit(etablissement_id,acteur_id,action,cible_id) VALUES($1,$2,$3,$4)',[p.etablissementId,p.userId,'CREATION_COMPTE',r.rows[0].id]);return r.rows[0];
});

app.post('/admin/classes',async req=>{const p=req.principal!;if(p.role!=='ADMIN_PRINCIPAL')throw fail('Accès refusé',403);const{nom}=z.object({nom:z.string().trim().min(1).max(80)}).parse(req.body);const r=await db.query('INSERT INTO classes(etablissement_id,nom) VALUES($1,$2) RETURNING id,nom',[p.etablissementId,nom]);await db.query('INSERT INTO audit(etablissement_id,acteur_id,action,cible_id) VALUES($1,$2,$3,$4)',[p.etablissementId,p.userId,'CREATION_CLASSE',r.rows[0].id]);return r.rows[0]});

app.post('/admin/spaces',async req=>{const p=req.principal!;if(p.role!=='ADMIN_PRINCIPAL')throw fail('Accès refusé',403);const input=z.object({nom:z.string().trim().min(2).max(120),type:z.enum(['CLASSE','MATIERE','GENERAL_ELEVES','PERSONNEL']),classeId:z.string().uuid().nullable().optional(),membres:z.array(z.object({utilisateurId:z.string().uuid(),moderateur:z.boolean().default(false)})).min(1)}).parse(req.body);
  return tx(async c=>{const e=await c.query('INSERT INTO espaces(etablissement_id,nom,type,classe_id,cree_par) VALUES($1,$2,$3,$4,$5) RETURNING id,nom,type',[p.etablissementId,input.nom,input.type,input.classeId??null,p.userId]);for(const m of input.membres)await c.query(`INSERT INTO espace_membres(espace_id,utilisateur_id,peut_moderer) SELECT $1,id,$3 FROM utilisateurs WHERE id=$2 AND etablissement_id=$4`,[e.rows[0].id,m.utilisateurId,m.moderateur,p.etablissementId]);await c.query('INSERT INTO espace_membres(espace_id,utilisateur_id,peut_moderer) VALUES($1,$2,true) ON CONFLICT DO NOTHING',[e.rows[0].id,p.userId]);await c.query('INSERT INTO audit(etablissement_id,acteur_id,action,cible_id) VALUES($1,$2,$3,$4)',[p.etablissementId,p.userId,'CREATION_ESPACE',e.rows[0].id]);return e.rows[0]});
});

app.patch('/admin/spaces/:id/writing',async req=>{const p=req.principal!;if(p.role!=='ADMIN_PRINCIPAL')throw fail('Accès refusé',403);const{id}=z.object({id:z.string().uuid()}).parse(req.params);const{fermee}=z.object({fermee:z.boolean()}).parse(req.body);const r=await db.query('UPDATE espaces SET ecriture_fermee=$1 WHERE id=$2 AND etablissement_id=$3 RETURNING id',[fermee,id,p.etablissementId]);if(!r.rowCount)throw fail('Espace introuvable',404);await db.query('INSERT INTO audit(etablissement_id,acteur_id,action,cible_id) VALUES($1,$2,$3,$4)',[p.etablissementId,p.userId,fermee?'FERMETURE_ECRITURE':'OUVERTURE_ECRITURE',id]);return{ok:true}});

app.patch('/admin/users/:id/status', async req=>{
  const p=req.principal!;if(p.role!=='ADMIN_PRINCIPAL')throw fail('Accès refusé',403);const{id}=z.object({id:z.string().uuid()}).parse(req.params);const{actif}=z.object({actif:z.boolean()}).parse(req.body);
  await tx(async c=>{const r=await c.query('UPDATE utilisateurs SET actif=$1 WHERE id=$2 AND etablissement_id=$3 RETURNING id',[actif,id,p.etablissementId]);if(!r.rowCount)throw fail('Compte introuvable',404);if(!actif)await c.query('UPDATE sessions SET revoked_at=now() WHERE utilisateur_id=$1',[id]);await c.query('INSERT INTO audit(etablissement_id,acteur_id,action,cible_id) VALUES($1,$2,$3,$4)',[p.etablissementId,p.userId,actif?'ACTIVATION_COMPTE':'SUSPENSION_COMPTE',id]);});return{ok:true};
});

app.post('/admin/ideas/:id/respond', async req=>{
  const p=req.principal!; if(p.role!=='ADMIN_PRINCIPAL') throw fail('Accès refusé',403);
  const {id}=z.object({id:z.string().uuid()}).parse(req.params); const {reponse}=z.object({reponse:z.string().trim().min(2).max(4000)}).parse(req.body);
  await db.query('UPDATE idees SET reponse=$1,answered_at=now() WHERE id=$2 AND etablissement_id=$3',[reponse,id,p.etablissementId]);
  await db.query('INSERT INTO audit(etablissement_id,acteur_id,action,cible_id) VALUES($1,$2,$3,$4)',[p.etablissementId,p.userId,'REPONSE_IDEE',id]);
  return {ok:true};
});

const port=Number(process.env.PORT??4000);
app.listen({port,host:'0.0.0.0'}).catch(error=>{app.log.error(error);process.exit(1)});
