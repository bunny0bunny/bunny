'use server';
import * as service from './service';
export async function savePublicIdentity(input: unknown) {
    return service.savePublicIdentity(input);
}
export async function setSeriesPublicCredits(input: unknown) {
    return service.setSeriesPublicCredits(input);
}
export async function setIdentityFollow(input: {
    identityId: string;
    following: boolean;
}) {
    return service.setIdentityFollow(input);
}
export async function setIdentityAlerts(input: {
    identityId: string;
    enabled: boolean;
}) {
    return service.setIdentityAlerts(input);
}
