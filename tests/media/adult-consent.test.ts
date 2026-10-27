import {expect,test} from 'bun:test';
import {hasAdultConsent, rememberAdultConsent} from '../../src/lib/adult-consent';
test('consent is per work and only the explicit accepted value grants continuation',()=>{
 const values=new Map<string,string>();const storage=()=>({getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}});
 expect(hasAdultConsent('one',storage)).toBe(false);
 expect(rememberAdultConsent('one',storage)).toBe(true);
 expect(hasAdultConsent('one',storage)).toBe(true);expect(hasAdultConsent('two',storage)).toBe(false);
 values.clear();expect(hasAdultConsent('one',storage)).toBe(false);
});
test('blocked or unavailable browser storage neither grants consent nor prevents in-memory continuation',()=>{
 const blocked=()=>{throw Error('blocked');};expect(hasAdultConsent('one',blocked)).toBe(false);expect(rememberAdultConsent('one',blocked)).toBe(false);
 expect(hasAdultConsent('one')).toBe(false);
});
