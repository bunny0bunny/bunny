import { changeIdentityAvatar } from '@/lib/public-identities/avatar';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {return changeIdentityAvatar(request,(await params).id);}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}) {return changeIdentityAvatar(request,(await params).id,true);}
