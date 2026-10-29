import {expect,test} from 'bun:test';
import {isChapterNumber,nextChapterNumber} from '../../src/lib/chapter-number';
import {readerHref} from '../../src/lib/reader-route';

test('integer and decimal chapter numbers share the same bounded validation',()=>{
  for(const number of [1,7,7.5,7.6,7.125])expect(isChapterNumber(number)).toBe(true);
  for(const number of [NaN,Infinity,-Infinity,0,-1,0.5,2147483648,'7.6'])expect(isChapterNumber(number)).toBe(false);
});
test('suggested next whole chapter and decimal reader URLs keep their meaning',()=>{
  expect(nextChapterNumber(7.6)).toBe(8);expect(nextChapterNumber(7)).toBe(8);expect(nextChapterNumber(null)).toBe(1);
  expect(readerHref('manga','work',7.6)).toBe('/read/manga/work/7.6');
});
