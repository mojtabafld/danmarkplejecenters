import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = ts.transpileModule(readFileSync('src/theme.ts','utf8'), { compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022} }).outputText;
function meta(){return {content:'',setAttribute(k,v){this[k]=v},removeAttribute(k){delete this[k]}}}
const themeMeta=meta(),schemeMeta=meta();
const root={style:{},setAttribute(k,v){this[k]=v},removeAttribute(k){delete this[k]}};
let frameId=0; const frames=new Map(); const events=new Map();
function nextFrame(){ const work=[...frames.values()]; frames.clear(); for(const fn of work) fn(); }
const document={documentElement:root,body:{style:{}},head:{appendChild(){}},querySelector(selector){return selector.includes('theme-color')?themeMeta:schemeMeta}};
let saved='light',deviceChange,deviceDark=false,legacy='dark';
const context={exports:{},document,window:{requestAnimationFrame(fn){frames.set(++frameId,fn);return frameId},cancelAnimationFrame(id){frames.delete(id)},addEventListener(type,fn){events.set(type,fn)},matchMedia(){return{get matches(){return deviceDark},addEventListener(_,fn){deviceChange=fn}}}},localStorage:{getItem(){return legacy},removeItem(){legacy=null}},sessionStorage:{getItem(){return saved},setItem(_,v){saved=v},removeItem(){saved=null}},getComputedStyle(){return{getPropertyValue(){return root['data-theme']==='dark'?'#10131A':'#FFFFFF'}}}};
vm.runInNewContext(source,context);
assert.equal(legacy,null,'the old permanent choice is retired on load');
const controller=new context.exports.ThemeController();
assert.equal(themeMeta.content,'#FFFFFF');
for(const expected of ['#10131A','#FFFFFF','#10131A']){
 controller.toggle();
 assert.equal(themeMeta.content,expected);
 assert.equal(root.style.backgroundColor,expected);
 assert.equal(document.body.style.backgroundColor,expected);
 assert.equal(root.style.colorScheme,controller.current);
 assert.equal(schemeMeta.content,controller.current);
 assert.equal(document.querySelector('meta[name="theme-color"]'),themeMeta);
}
assert.equal(saved,'dark','an override that differs from the device lasts for this tab');
controller.toggle();assert.equal(saved,null,'toggling back to the device clears the override');
controller.toggle();assert.equal(saved,'dark');
deviceDark=false;deviceChange();assert.equal(controller.current,'light','a device change wins over the toggle');
assert.equal(saved,null,'and ends the override');
deviceDark=true;deviceChange();assert.equal(controller.current,'dark','the page follows the device mid-visit');
assert.equal(themeMeta.content,'#10131A');
console.log('Immediate theme, document backgrounds, colour scheme and stable theme-color metadata checks passed');

assert.equal(frames.size,1,'rapid toggles cancel stale refresh work');
assert.ok(Object.hasOwn(root,'data-browser-tint-refresh'));
nextFrame();
assert.ok(Object.hasOwn(root,'data-browser-tint-refresh'),'geometry pulse survives a painted frame');
nextFrame();
assert.ok(!Object.hasOwn(root,'data-browser-tint-refresh'));
events.get('pageshow')();
assert.ok(Object.hasOwn(root,'data-browser-tint-refresh'),'back/forward restore refreshes toolbar sample');
nextFrame();nextFrame();
assert.equal(frames.size,0);
console.log('Toolbar refresh scheduling, rapid toggles and page restore checks passed');
