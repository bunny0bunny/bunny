import { z } from "zod";
export function normalizeRequestTitle(value: string) { return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim(); }
const id = z.string().trim().min(1).max(128);
const version = z.number().int().min(1).max(2147483646);
const optionalText = (max:number) => z.string().trim().max(max).nullish().transform(value => value || null);
const reference = optionalText(2048).refine(value => {
  if (!value) return true;
  try { const url = new URL(value); return ["http:","https:"].includes(url.protocol) && !!url.hostname && !url.username && !url.password && !/[\u0000-\u0020\\]/u.test(value); } catch { return false; }
});
export const createRequestSchema = z.object({ title:z.string().trim().min(2).max(150), category:z.enum(["manga","manhwa","novel","comic"]), referenceUrl:reference, message:optionalText(1000), submissionId:z.string().uuid() });
export const statusRequestSchema = z.object({id,expectedVersion:version,status:z.enum(["new","reviewing","preparing","available","declined"]),statusNote:optionalText(1000),seriesId:id.nullish()}).refine(value => value.status !== "available" || !!value.seriesId);
export const replyRequestSchema = z.object({id,expectedVersion:version,reply:optionalText(1000),internalNote:optionalText(2000)});
export const mergeRequestSchema = z.object({sourceId:id,targetId:id,expectedSourceVersion:version,expectedTargetVersion:version});
export function requestPage(value:unknown) { return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? Math.min(value,1000000) : 1; }
