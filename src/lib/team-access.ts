import "server-only";
import { db } from "@/lib/db";

export function isStaffRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "editor" || role === "contributor";
}

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "admin";
}

export function isModeratorRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "editor";
}

export function isAssignableRole(role: string | null | undefined): boolean {
  return role === "contributor" || role === "editor";
}

export async function isAssignedToSeries(profileId: string, seriesId: string): Promise<boolean> {
  const assignment = await db.seriesAssignment.findUnique({
    where: { profileId_seriesId: { profileId, seriesId }, series: { deletedAt: null } },
    select: { id: true },
  });
  return assignment !== null;
}

export async function canManageSeries(
  actor: { id: string; role: string },
  seriesId: string
): Promise<boolean> {
  if (!await db.series.findFirst({ where: { id: seriesId, deletedAt: null }, select: { id: true } })) return false;
  if (actor.role === "admin") return true;
  if (actor.role === "editor" || actor.role === "contributor") {
    return isAssignedToSeries(actor.id, seriesId);
  }
  return false;
}
