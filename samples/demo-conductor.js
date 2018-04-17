// generated by composer v0.4.0

const composition = {
    "type": "if",
    "test": {
        "type": "action",
        "name": "/_/authenticate"
    },
    "consequent": {
        "type": "action",
        "name": "/_/success"
    },
    "alternate": {
        "type": "action",
        "name": "/_/failure"
    }
}

// do not edit below this point

const main=function({Compiler:e}){const t=new e;function n(e,t){return e.slice(-1)[0].next=1,e.push(...t),e}function r(e,t){
return 0===e.length?[{type:"pass",path:t}]:e.map((e,n)=>s(e,t+"["+n+"]")).reduce(n)}function s(e,t=""){switch(e.type){
case"sequence":return r(e.components,t);case"action":return[{type:"action",name:e.name,path:t}];case"function":return[{
type:"function",exec:e.function.exec,path:t}];case"finally":var a=s(e.body,t+".body");const u=s(e.finalizer,t+".finalizer")
;return(c=[[{type:"try",path:t}],a,[{type:"exit",path:t}],u].reduce(n))[0].catch=c.length-u.length,c;case"let":
a=r(e.components,t);return[[{type:"let",let:e.declarations,path:t}],a,[{type:"exit",path:t}]].reduce(n);case"mask":return[[{
type:"let",let:null,path:t}],a=r(e.components,t),[{type:"exit",path:t}]].reduce(n);case"try":a=s(e.body,t+".body")
;const p=n(s(e.handler,t+".handler"),[{type:"pass",path:t}]);return(c=[[{type:"try",path:t}],a,[{type:"exit",path:t
}]].reduce(n))[0].catch=c.length,c.slice(-1)[0].next=p.length,c.push(...p),c;case"if_nosave":
var o=s(e.consequent,t+".consequent"),i=n(s(e.alternate,t+".alternate"),[{type:"pass",path:t}]),c=n(s(e.test,t+".test"),[{
type:"choice",then:1,else:o.length+1,path:t}]);return o.slice(-1)[0].next=i.length,c.push(...o),c.push(...i),c
;case"while_nosave":o=s(e.body,t+".body"),i=[{type:"pass",path:t}],c=n(s(e.test,t+".test"),[{type:"choice",then:1,
else:o.length+1,path:t}]);return o.slice(-1)[0].next=1-c.length-o.length,c.push(...o),c.push(...i),c;case"dowhile_nosave":
var l=s(e.test,t+".test");(c=[s(e.body,t+".body"),l,[{type:"choice",then:1,else:2,path:t
}]].reduce(n)).slice(-1)[0].then=1-c.length,c.slice(-1)[0].else=1;i=[{type:"pass",path:t}];return c.push(...i),c}}
this.require=require
;const a=s(t.lower(t.deserialize(composition))),o=e=>"object"==typeof e&&null!==e&&!Array.isArray(e),i=e=>Promise.reject({
code:400,error:e}),c=e=>Promise.reject((e=>({code:"number"==typeof e.code&&e.code||500,
error:"string"==typeof e.error&&e.error||e.message||"string"==typeof e&&e||"An internal error occurred"}))(e))
;return e=>Promise.resolve().then(()=>(function(e){let t=0,n=[];if(void 0!==e.$resume){
if(!o(e.$resume))return i("The type of optional $resume parameter must be object");if(t=e.$resume.state,n=e.$resume.stack,
void 0!==t&&"number"!=typeof t)return i("The type of optional $resume.state parameter must be number")
;if(!Array.isArray(n))return i("The type of $resume.stack must be an array");delete e.$resume,r()}function r(){if(o(e)||(e={
value:e}),void 0!==e.error)for(e={error:e.error},t=void 0;n.length>0&&"number"!=typeof(t=n.shift().catch););}function s(t){
const r=[];let s=0;for(let e of n)null===e.let?s++:void 0!==e.let&&(0===s?r.push(e):s--);function a(e,t){
const n=r.find(t=>void 0!==t.let&&void 0!==t.let[e]);void 0!==n&&(n.let[e]=JSON.parse(JSON.stringify(t)))}
const o=r.reduceRight((e,t)=>"object"==typeof t.let?Object.assign(e,t.let):e,{});let i="(function(){try{"
;for(const e in o)i+=`var ${e}=arguments[1]['${e}'];`;i+=`return eval((${t}))(arguments[0])}finally{`
;for(const e in o)i+=`arguments[1]['${e}']=${e};`;i+="}})";try{return(0,eval)(i)(e,o)}finally{for(const e in o)a(e,o[e])}}
for(;;){if(void 0===t)return console.log("Entering final state"),console.log(JSON.stringify(e)),e.error?e:{params:e}
;const o=a[t];console.log(`Entering state ${t} at path fsm${o.path}`);const i=t;switch(t=void 0===o.next?void 0:i+o.next,
o.type){case"choice":t=i+(e.value?o.then:o.else);break;case"try":n.unshift({catch:i+o.catch});break;case"let":n.unshift({
let:JSON.parse(JSON.stringify(o.let))});break;case"exit":
if(0===n.length)return c(`State ${i} attempted to pop from an empty stack`);n.shift();break;case"action":return{action:o.name,
params:e,state:{$resume:{state:t,stack:n}}};case"function":let a;try{a=s(o.exec.code)}catch(e){console.error(e),a={
error:`An exception was caught at state ${i} (see log for details)`}}"function"==typeof a&&(a={
error:`State ${i} evaluated to a function`}),e=JSON.parse(JSON.stringify(void 0===a?e:a)),r();break;case"pass":r();break
;default:return c(`State ${i} has an unknown type`)}}})(e)).catch(c)}(function(){const e=require("util"),t={empty:{},seq:{
components:!0},sequence:{components:!0},if:{args:[{_:"test"},{_:"consequent"},{_:"alternate",optional:!0}]},if_nosave:{args:[{
_:"test"},{_:"consequent"},{_:"alternate",optional:!0}]},while:{args:[{_:"test"},{_:"body"}]},while_nosave:{args:[{_:"test"},{
_:"body"}]},dowhile:{args:[{_:"body"},{_:"test"}]},dowhile_nosave:{args:[{_:"body"},{_:"test"}]},try:{args:[{_:"body"},{
_:"handler"}]},finally:{args:[{_:"body"},{_:"finalizer"}]},retain:{components:!0},retain_catch:{components:!0},let:{args:[{
_:"declarations",type:"object"}],components:!0},mask:{components:!0},action:{args:[{_:"name",type:"string"},{_:"action",
type:"object",optional:!0}]},composition:{args:[{_:"name",type:"string"},{_:"composition"}]},repeat:{args:[{_:"count",
type:"number"}],components:!0},retry:{args:[{_:"count",type:"number"}],components:!0},value:{args:[{_:"value",type:"value"}]},
literal:{args:[{_:"value",type:"value"}]},function:{args:[{_:"function",type:"object"}]}};class n extends Error{
constructor(t,n){super(t+(void 0!==n?"\nArgument: "+e.inspect(n):""))}}class Composition{static[Symbol.hasInstance](e){
return e.constructor&&e.constructor.name===Composition.name}constructor(e){return Object.assign(this,e)}visit(e){
const n=t[this.type];n.components&&(this.components=this.components.map(e))
;for(let t of n.args||[])void 0===t.type&&(this[t._]=e(this[t._]))}}class r{task(e){
if(arguments.length>1)throw new n("Too many arguments");if(null===e)return this.empty();if(e instanceof Composition)return e
;if("function"==typeof e)return this.function(e);if("string"==typeof e)return this.action(e);throw new n("Invalid argument",e)}
function(e){if(arguments.length>1)throw new n("Too many arguments")
;if("function"==typeof e&&-1!==(e=`${e}`).indexOf("[native code]"))throw new n("Cannot capture native function",e)
;if("string"==typeof e&&(e={kind:"nodejs:default",code:e}),"object"!=typeof e||null===e)throw new n("Invalid argument",e)
;return new Composition({type:"function",function:{exec:e}})}_empty(){return this.sequence()}_seq(e){
return this.sequence(...e.components)}_value(e){return this._literal(e)}_literal(e){return this.let({value:e.value},()=>value)}
_retain(e){return this.let({params:null},e=>{params=e},this.mask(...e.components),e=>({params:params,result:e}))}
_retain_catch(e){return this.seq(this.retain(this.finally(this.seq(...e.components),e=>({result:e}))),({params:e,result:t})=>({
params:e,result:t.result}))}_if(e){return this.let({params:null},e=>{params=e
},this.if_nosave(this.mask(e.test),this.seq(()=>params,this.mask(e.consequent)),this.seq(()=>params,this.mask(e.alternate))))}
_while(e){return this.let({params:null},e=>{params=e
},this.while_nosave(this.mask(e.test),this.seq(()=>params,this.mask(e.body),e=>{params=e})),()=>params)}_dowhile(e){
return this.let({params:null},e=>{params=e},this.dowhile_nosave(this.seq(()=>params,this.mask(e.body),e=>{params=e
}),this.mask(e.test)),()=>params)}_repeat(e){return this.let({count:e.count
},this.while(()=>count-- >0,this.mask(this.seq(...e.components))))}_retry(e){return this.let({count:e.count},e=>({params:e
}),this.dowhile(this.finally(({params:e})=>e,this.mask(this.retain_catch(...e.components))),({result:e})=>void 0!==e.error&&count-- >0),({result:e})=>e)
}static init(){for(let e in t){const s=t[e];r.prototype[e]=r.prototype[e]||function(){const t=new Composition({type:e
}),r=s.args&&s.args.length||0
;if(s.components)t.components=Array.prototype.slice.call(arguments,r).map(e=>this.task(e));else if(arguments.length>r)throw new n("Too many arguments")
;for(let e=0;e<r;++e){const r=s.args[e],a=r.optional?arguments[e]||null:arguments[e];switch(r.type){case void 0:
t[r._]=this.task(a);continue;case"value":if("function"==typeof a)throw new n("Invalid argument",a);t[r._]=void 0===a?{}:a
;continue;case"object":if(null===a||Array.isArray(a))throw new n("Invalid argument",a);default:
if(typeof a!==r.type)throw new n("Invalid argument",a);t[r._]=a}}return t}}}get combinators(){return t}deserialize(e){
if(arguments.length>1)throw new n("Too many arguments");return(e=new Composition(e)).visit(e=>this.deserialize(e)),e}
lower(e,t=[]){if(arguments.length>2)throw new n("Too many arguments")
;if(!(e instanceof Composition))throw new n("Invalid argument",e);if(!Array.isArray(t))throw new n("Invalid argument",t)
;const r=e=>{for(e=new Composition(e);t.indexOf(e.type)<0&&this[`_${e.type}`];)e=this[`_${e.type}`](e);return e.visit(r),e}
;return r(e)}}return r.init(),{ComposerError:n,Composition:Composition,Compiler:r}}());
