import {afterAll, beforeAll, expect, test} from 'bun:test';
import {actions, db, setActor} from './session-fixture';
import {getChapterForReading} from '../../src/lib/queries';
import {POST} from '../../src/app/api/reading-targets/route';

const tag = `decimal-${crypto.randomUUID()}`;
let profileId: string, seriesId: string;
beforeAll(async () => {
  const profile = await db.profile.create({data:{email:`${tag}@bunny.test`,nickname:'QA',role:'admin',passwordHash:'x',emailVerifiedAt:new Date()}});
  profileId=profile.id;setActor(profileId);
  const series=await db.series.create({data:{slug:tag,titleAr:'اختبار',titleOriginal:'Decimal Chapters',synopsisAr:'اختبار الفصول العشرية',format:'manga',author:'QA',coverPath:''}});
  seriesId=series.id;
});
afterAll(async()=>{setActor(null);await db.chapterPublication.deleteMany({where:{seriesId}});await db.series.deleteMany({where:{id:seriesId}});await db.profile.deleteMany({where:{id:profileId}});});

test('decimal chapters save without truncation, sort numerically and resolve progress/comments/targets',async()=>{
  const created=await actions.createChapter({seriesId,number:7.6,titleAr:'فصل إضافي',workflow:'draft',isPremiumDemo:false});
  expect(created.ok).toBe(true);
  const chapter=await db.chapter.findUniqueOrThrow({where:{id:created.id}});expect(chapter.number).toBe(7.6);
  expect((await actions.createChapter({seriesId,number:7.60,titleAr:'مكرر',workflow:'draft',isPremiumDemo:false})).ok).toBe(false);
  await db.chapter.update({where:{id:chapter.id},data:{workflow:'published',publishedAt:new Date()}});
  for(const number of [7,7.5,8])await db.chapter.create({data:{seriesId,number,titleAr:'فصل',workflow:'published',publishedAt:new Date()}});
  const readable=await getChapterForReading(tag,7.6);
  expect(readable?.chapter.number).toBe(7.6);expect(readable?.prev?.number).toBe(7.5);expect(readable?.next?.number).toBe(8);
  expect(readable?.chapterList.map(c=>c.number)).toEqual([7,7.5,7.6,8]);
  expect((await actions.saveReadingProgress({seriesSlug:tag,chapterNumber:7.6,pageIndex:0,percent:40,completed:false})).ok).toBe(true);
  expect((await actions.postComment({seriesSlug:tag,chapterNumber:7.6,body:'تعليق على الفصل الإضافي'})).ok).toBe(true);
  expect(await db.comment.count({where:{chapterId:chapter.id}})).toBe(1);
  const response=await POST(new Request('http://localhost/api/reading-targets',{method:'POST',body:JSON.stringify({targets:[{seriesSlug:tag,chapterNumber:7.6,format:'manga'}]})}));
  expect(response.status).toBe(200);expect((await response.json()).readable[0].chapterNumber).toBe(7.6);
  const event=await db.chapterPublication.create({data:{chapterId:chapter.id,seriesId,chapterNumber:7.6,seriesTitle:'QA',chapterTitle:'QA',seriesSlug:tag,format:'manga',state:'baseline'}});
  expect(event.chapterNumber).toBe(7.6);
});
