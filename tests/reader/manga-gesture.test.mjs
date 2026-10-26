import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mangaGestureAction} from '../../src/lib/manga-gesture.ts';
const gesture={startX:100,startY:100,endX:100,endY:100,width:1000,left:0,duration:100,maxDistance:0,direction:'rtl'};
test('tap zones respect physical edges and reading direction',()=>{
 assert.equal(mangaGestureAction(gesture),'next');
 assert.equal(mangaGestureAction({...gesture,startX:500,endX:500}),'toggle');
 assert.equal(mangaGestureAction({...gesture,startX:900,endX:900}),'previous');
 assert.equal(mangaGestureAction({...gesture,direction:'ltr'}),'previous');
 assert.equal(mangaGestureAction({...gesture,left:300,width:560}),'next');
 assert.equal(mangaGestureAction({...gesture,left:300,width:560,startX:1000,endX:1000}),'previous');
});
test('a deliberate horizontal swipe follows the reading direction',()=>{
 assert.equal(mangaGestureAction({...gesture,endX:200,maxDistance:100}),'next');
 assert.equal(mangaGestureAction({...gesture,endX:0,maxDistance:100}),'previous');
 assert.equal(mangaGestureAction({...gesture,endX:0,maxDistance:100,direction:'ltr'}),'next');
});
test('scrolling, jitter, returning drags and long presses do not turn pages',()=>{
 for(const patch of [{endY:200,maxDistance:100},{endX:130,maxDistance:30},{maxDistance:30},{duration:800},{endX:200,endY:200,maxDistance:142}])assert.equal(mangaGestureAction({...gesture,...patch}),null);
});
