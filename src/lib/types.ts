export type User={id:string;name:string;email:string};
export type Company={id:string;name:string;cui?:string;tax_identifier?:string};
export type AuthPayload={access_token:string;token_type:string;expires_at?:string;user:User};
export type Invoice={id:string;number?:string;document_number?:string;issue_date:string;due_date?:string;status:string;currency?:string;total?:number|string;total_amount?:number|string;customer?:{name:string}};
