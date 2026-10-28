export type PublicationSummary = {examined:number;delivered:number;completed:number;suppressed:number;failed:number;skipped:number};
export type LegacyPublicationDiscovery = {historical:{chapterId:string;seriesId:string;evidence:string[];firstPublishedAt:string|null}[];ambiguous:{chapterId:string;seriesId:string}[]};
