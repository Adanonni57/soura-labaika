const base=import.meta.env.VITE_API_URL??'http://localhost:4000';
const TOKEN_KEY='soura_token';
let token:string|null=localStorage.getItem(TOKEN_KEY);
export function setToken(value:string|null){token=value;if(value)localStorage.setItem(TOKEN_KEY,value);else localStorage.removeItem(TOKEN_KEY)}
export async function api<T>(path:string,init:RequestInit={}):Promise<T>{
  const headers:Record<string,string>={'Content-Type':'application/json',...(init.headers as Record<string,string>)};
  if(token)headers.Authorization=`Bearer ${token}`;
  const response=await fetch(`${base}${path}`,{...init,credentials:'include',headers});
  const body=await response.json().catch(()=>({})); if(!response.ok) throw new Error(body.error??'Erreur réseau'); return body;
}
export type Me={id:string;identifiant:string;nom_affichage:string;role:string;classe_id?:string};
export type Space={id:string;nom:string;type:string};
export type Message={id:string;contenu:string;created_at:string;auteur:string};