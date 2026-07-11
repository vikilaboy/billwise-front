export type ApiEnvelope<T>={data:T;meta?:Record<string,unknown>};
export type ProblemDetails={type?:string;title:string;status:number;detail?:string;errors?:Record<string,string[]>};
export class ApiError extends Error{constructor(public readonly problem:ProblemDetails){super(problem.detail??problem.title)}}
const API_URL=import.meta.env.VITE_API_URL??"https://api.billwise.localhost/api/v1";
const TOKEN_KEY="billwise_access_token";
export const session={token:()=>localStorage.getItem(TOKEN_KEY),save:(token:string)=>localStorage.setItem(TOKEN_KEY,token),clear:()=>localStorage.removeItem(TOKEN_KEY)};
export async function api<T>(path:string,init:RequestInit={}):Promise<ApiEnvelope<T>>{const headers=new Headers(init.headers);headers.set("Accept","application/json, application/problem+json");if(init.body)headers.set("Content-Type","application/json");const token=session.token();if(token)headers.set("Authorization",`Bearer ${token}`);const response=await fetch(`${API_URL}${path}`,{...init,headers});if(response.status===204)return{data:undefined as T};const payload=await response.json();if(!response.ok)throw new ApiError({title:payload.title??"Cererea nu a putut fi procesată",status:response.status,detail:payload.detail??payload.message,errors:payload.errors,type:payload.type});return payload;}
