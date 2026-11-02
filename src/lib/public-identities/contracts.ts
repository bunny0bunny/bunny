import type { SeriesCard } from '@/lib/queries';
export type IdentityKind = 'individual' | 'team';
export type IdentityStatus = 'active' | 'suspended';
export type CreditRole = 'translation' | 'editing' | 'preparation';
export type IdentityView = {id:string;slug:string;displayName:string;bio:string;avatarSeed:string;kind:IdentityKind;status:IdentityStatus;version:number;followerCount:number;workCount:number;avatarPath:string|null;ratingAverage:number|null;ratingCount:number};
export type ManagedIdentityView = IdentityView & {ownerProfileId:string|null};
export type CreditView = {identityId:string;slug:string;displayName:string;role:CreditRole;status:IdentityStatus};
export type FollowView = {following:boolean;alertsEnabled:boolean};
export type IdentityDetail = {identity:IdentityView;works:SeriesCard[];recentChapters:{id:string;number:number;title:string;seriesTitle:string;seriesSlug:string;format:string;isAdult:boolean;isPremium:boolean;publishedAt:string}[]};
export type IdentityResult = {ok:boolean;error?:string;id?:string;follow?:FollowView;rating?:{value:number|null;average:number|null;count:number};version?:number;avatarPath?:string|null};
export type SaveIdentityInput = {ownerProfileId?:string|null;id?:string;expectedVersion?:number;slug:string;displayName:string;bio:string;avatarSeed:string;kind:IdentityKind;status:IdentityStatus};
export type SetCreditsInput = {seriesId:string;expectedUpdatedAt:string;credits:{identityId:string;role:CreditRole}[]};

export type UpdateOwnedIdentityInput = {id:string;expectedVersion:number;displayName:string;bio:string;avatarSeed:string};
