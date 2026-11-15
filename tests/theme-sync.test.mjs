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
let saved='light',deviceChange;
const context={exports:{},document,window:{requestAnimationFrame(fn){frames.set(++frameId,fn);return frameId},cancelAnimationFrame(id){frames.delete(id)},addEventListener(type,fn){events.set(type,fn)},matchMedia(){return{matches:false,addEventListener(_,fn){deviceChange=fn}}}},localStorage:{getItem(){return saved},setItem(_,v){saved=v}},getComputedStyle(){return{getPropertyValue(){return root['data-theme']==='dark'?'#10131A':'#FFFFFF'}}}};
vm.runInNewContext(source,context);
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
deviceChange();assert.equal(controller.current,'dark','manual choice must override OS changes');
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
