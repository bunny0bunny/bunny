import { getProfileAvatar } from "@/lib/profile-avatar";
export async function GET(_request: Request, { params }: { params: Promise<{ profileId: string; file: string }> }) { const p = await params; return getProfileAvatar(p.profileId, p.file); }
