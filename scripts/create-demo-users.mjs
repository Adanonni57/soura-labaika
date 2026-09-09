import argon2 from 'argon2';
import pg from 'pg';
const password=process.env.DEMO_INITIAL_PASSWORD;
if(!password||password.length<12)throw new Error('Définissez DEMO_INITIAL_PASSWORD (12 caractères minimum).');
const db=new pg.Pool({connectionString:process.env.DATABASE_URL});
const client=await db.connect();
try{
  await client.query('BEGIN');
  const e=await client.query("SELECT id FROM etablissements WHERE slug='labaika-niaogho'");
  if(!e.rowCount)throw new Error('Établissement de démonstration absent.');
  const eid=e.rows[0].id;const c=await client.query("INSERT INTO classes(etablissement_id,nom) VALUES($1,'3e A') ON CONFLICT(etablissement_id,nom) DO UPDATE SET nom=excluded.nom RETURNING id",[eid]);
  const hash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:65536,timeCost:3});
  const users=[['eleve.demo','Awa Démo','ELEVE',c.rows[0].id],['prof.demo','M. Ouédraogo','PROFESSEUR',null],['administration.demo','Mme Traoré','ADMINISTRATION',null],['admin.demo','Admin Principal','ADMIN_PRINCIPAL',null]];
  for(const [identifiant,nom,role,classe] of users)await client.query(`INSERT INTO utilisateurs(etablissement_id,classe_id,identifiant,nom_affichage,role,password_hash)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(identifiant) DO NOTHING`,[eid,classe,identifiant,nom,role,hash]);
  await client.query('COMMIT');console.log('Comptes fictifs créés : eleve.demo, prof.demo, administration.demo, admin.demo');
}catch(error){await client.query('ROLLBACK');throw error}finally{client.release();await db.end()}
