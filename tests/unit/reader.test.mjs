import test from 'node:test';import assert from 'node:assert/strict';
import {readerPreferences,READER_KEY} from '../../src/reader.js';
const storage=value=>({getItem:()=>value});
test('reading defaults survive corrupt preferences and ignore injected CSS values',()=>{
 for(const value of [null,'invalid','null','{}',JSON.stringify({theme:'url(evil)',size:'100vh',font:'bad'})])assert.deepEqual(readerPreferences(storage(value)),{theme:'paper',size:20,font:'serif'});
 assert.deepEqual(readerPreferences(storage(JSON.stringify({theme:'night',font:'sans',size:'24'}))),{theme:'night',font:'sans',size:24});
 assert.equal(READER_KEY,'aurelius.reader.v1');
});
