import test from 'node:test';
import assert from 'node:assert/strict';
import {findQuoteOverlaps} from './check-quote-overlap.mjs';
const unit=eng=>`<LearningUnit><Fragment slot="eng">${eng}</Fragment></LearningUnit>`;
test('short standalone quote contained in another unit is blocked',()=>{
  const overlaps=findQuoteOverlaps(unit('clear summit')+unit('We reach a clear summit together'));
  assert.equal(overlaps.length,1);
  assert.deepEqual([overlaps[0].firstUnit,overlaps[0].secondUnit,overlaps[0].sharedTokens],[1,2,2]);
});
test('inline vocabulary and apostrophe forms do not conceal containment',()=>{
  assert.equal(findQuoteOverlaps(unit('clear <QuickSlang word="summit" desc="meaning" />')+unit('We reach a clear summit together')).length,1);
  assert.equal(findQuoteOverlaps(unit("we&apos;re climbing")+unit('We’re climbing higher')).length,1);
});
test('partial eight-word overlap is blocked without full containment',()=>{
  assert.equal(findQuoteOverlaps(unit('before one two three four five six seven eight')+unit('one two three four five six seven eight after')).length,1);
});
test('two concepts sharing a quote inside one unit are valid',()=>{
  assert.equal(findQuoteOverlaps(unit('We reach a clear summit together<br />and continue our journey')).length,0);
});
test('unrelated quotes with generic shared words are valid',()=>{
  assert.equal(findQuoteOverlaps(unit('We walk through the town slowly')+unit('Listen to the town while resting')).length,0);
});
