import { getIdentityAvatar } from '@/lib/public-identities/avatar';
export async function GET(_request:Request,{params}:{params:Promise<{id:string;file:string}>}) {const p=await params;return getIdentityAvatar(p.id,p.file);}
