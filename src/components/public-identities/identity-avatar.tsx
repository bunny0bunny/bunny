"use client";
import { useState } from 'react';
import { AccountAvatar } from '@/components/accounts/account-avatar';

export function IdentityAvatar({ avatarPath, seed, name, className = 'size-12' }: { avatarPath?: string | null; seed?: string | null; name: string; className?: string }) {
  const [failedPath, setFailedPath] = useState<string | null>(null);
  if (!avatarPath || failedPath === avatarPath) return <AccountAvatar seed={seed} name={name} className={className} />;
  // Same-origin, versioned identity gateway; preserve uploaded transparency.
  return <img src={avatarPath} alt={name} onError={() => setFailedPath(avatarPath)} className={`shrink-0 rounded-full border border-border bg-card object-cover ${className}`} />;
}
