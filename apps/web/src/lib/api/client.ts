/** Sesión Supabase del usuario, inicializada solo al activar modo remoto. */
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {apiUrl,supabaseUrl,supabaseKey,configured} from './config';
let client: SupabaseClient | null=null;
export function supabase(){if(!configured)return null;return client??(client=createClient(supabaseUrl,supabaseKey));}
export interface RemoteProject{id:string;owner_id:string;name:string;description:string;status:'active'|'archived';created_at:string;updated_at:string;}
export async function request<T>(route:string,token:string,method='GET',body?:object):Promise<T>{
 const res=await fetch(`${apiUrl}/api/v1${route}`,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 if(!res.ok){let message=`Error HTTP ${res.status}`;try{const data:unknown=await res.json();if(data&&typeof data==='object'&&'detail'in data&&typeof data.detail==='string')message=data.detail;}catch{/* Respuesta sin JSON */}throw new Error(message);}
 if(res.status===204)return undefined as T;
 return res.json() as Promise<T>;
}
