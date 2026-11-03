import test from 'node:test';
import assert from 'node:assert/strict';
import {shape,isEventResponse} from '../tools/timetree-connection/diagnostics.mjs';
test('TimeTree diagnostics retain schema types without event content or credential values',()=>{
 const result=JSON.stringify(shape({events:[{title:'PRIVATE JOB',id:'PRIVATE-ID',start_at:123,token:'SECRET',owner:{email:'private@example.com'},'abc123-private-id':{title:'PRIVATE'}}]}));
 assert.doesNotMatch(result,/PRIVATE|SECRET|private@example|abc123-private-id/);
 assert.match(result,/title/);assert.match(result,/redacted/);
});
test('only successful TimeTree event JSON responses qualify for structural diagnostics',()=>{
 assert.equal(isEventResponse('https://timetreeapp.com/api/calendars/private/events?token=secret',200,'application/json'),true);
 for(const url of ['https://evil.test/events','https://timetreeapp.com.evil.test/events','https://timetreeapp.com/login','http://timetreeapp.com/events'])assert.equal(isEventResponse(url,200,'application/json'),false);
 assert.equal(isEventResponse('https://timetreeapp.com/events',401,'application/json'),false);
 assert.equal(isEventResponse('https://timetreeapp.com/events',200,'text/html'),false);
});
