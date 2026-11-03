import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = ts.transpileModule(readFileSync('src/theme.ts','utf8'), { compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022} }).outputText;
function meta(){return {content:'',setAttribute(k,v){this[k]=v},removeAttribute(k){delete this[k]}}}
const themeMeta=meta(),schemeMeta=meta();
const root={style:{},setAttribute(k,v){this[k]=v}};
const document={documentElement:root,body:{style:{}},head:{appendChild(){}},querySelector(selector){return selector.includes('theme-color')?themeMeta:schemeMeta}};
let saved='light',deviceChange;
const context={exports:{},document,window:{matchMedia(){return{matches:false,addEventListener(_,fn){deviceChange=fn}}}},localStorage:{getItem(){return saved},setItem(_,v){saved=v}},getComputedStyle(){return{getPropertyValue(){return root['data-theme']==='dark'?'#1C1C1E':'#FFFFFF'}}}};
vm.runInNewContext(source,context);
const controller=new context.exports.ThemeController();
assert.equal(themeMeta.content,'#FFFFFF');
for(const expected of ['#1C1C1E','#FFFFFF','#1C1C1E']){
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
