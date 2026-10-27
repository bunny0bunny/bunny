import {expect,test} from 'bun:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {AdultContentGate} from '../../src/components/readers/adult-content-gate';
import {normalizeGenre,normalizeGenres} from '../../src/lib/genres';
test('adult reader content stays unmounted in initial HTML until explicit continuation',()=>{
 const html=renderToStaticMarkup(<AdultContentGate isAdult={true} seriesId="one" seriesSlug="work" seriesTitle="Work <title>"><img src="/private-reader-page.webp" alt="page" /></AdultContentGate>);
 expect(html).toContain('للبالغين');expect(html).toContain('متابعة القراءة');expect(html).toContain('/series/work');expect(html).not.toContain('/private-reader-page.webp');expect(html).toContain('Work &lt;title&gt;');
});
test('ordinary work opens directly without a content warning',()=>{
 const html=renderToStaticMarkup(<AdultContentGate isAdult={false} seriesId="one" seriesSlug="work" seriesTitle="Work"><p>Reader body</p></AdultContentGate>);
 expect(html).toContain('Reader body');expect(html).not.toContain('متابعة القراءة');
});
test('daily-life aliases are canonical and deduplicated without losing unknown genres',()=>{
 expect(normalizeGenres(['شريحة من الحياة','الحياة اليومية','الحياه اليوميه','خاص'])).toEqual(['الحياة اليومية','خاص']);
 expect(normalizeGenre(' شوجو ')).toBe('شوجو');
});
