const base=import.meta.env.VITE_API_URL??'http://localhost:4000';
export async function api<T>(path:string,init:RequestInit={}):Promise<T>{
  const response=await fetch(`${base}${path}`,{...init,credentials:'include',headers:{'Content-Type':'application/json',...init.headers}});
  const body=await response.json().catch(()=>({})); if(!response.ok) throw new Error(body.error??'Erreur réseau'); return body;
}
export type Me={id:string;identifiant:string;nom_affichage:string;role:string;classe_id?:string};
export type Space={id:string;nom:string;type:string};
export type Message={id:string;contenu:string;created_at:string;auteur:string};
