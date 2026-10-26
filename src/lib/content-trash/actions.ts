'use server';
import * as service from './service';
import type { TrashKind, MoveToTrashInput, RestoreTrashInput, PermanentDeleteInput } from './contracts';
export async function getTrashPreview(kind: TrashKind, id: string) { return service.getTrashPreview(kind, id); }
export async function listTrash() { return service.listTrash(); }
export async function moveToTrash(input: MoveToTrashInput) { return service.moveToTrash(input); }
export async function restoreTrash(input: RestoreTrashInput) { return service.restoreTrash(input); }
export async function requestPermanentDelete(input: PermanentDeleteInput) { return service.requestPermanentDelete(input); }
