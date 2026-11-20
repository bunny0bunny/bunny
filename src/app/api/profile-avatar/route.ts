import { changeOwnProfileAvatar } from "@/lib/profile-avatar";
export async function POST(request: Request) { return changeOwnProfileAvatar(request); }
export async function DELETE(request: Request) { return changeOwnProfileAvatar(request, true); }
