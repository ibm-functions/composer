# Compose Command

The `compose` command makes it possible to encode and deploy compositions.
```
compose
```
```
Usage:
  compose composition.js[on] command [flags]
Commands:
  --json                 output the json representation for the composition (default command)
  --deploy NAME          deploy the composition with name NAME
  --encode               output the conductor action code for the composition
Flags:
  --apihost HOST         API HOST
  -u, --auth KEY         authorization KEY
  -i, --insecure         bypass certificate checking
```
The `compose` command requires either a Javascript file that evaluates to a composition (for example [demo.js](../samples/demo.js)) or a JSON file that encodes a composition (for example [demo.json](../samples/demo.json)). The JSON format is documented in [FORMAT.md](FORMAT.md).

The `compose` command has three mode of operation:
- By default or when the `--json` option is specified, the command returns the composition encoded as a JSON dictionary.
- When the `--deploy` option is specified, the command deploys the composition with the desired name.
- When the `--encode` option is specified, the command returns the Javascript code for the [conductor action](https://github.com/apache/incubator-openwhisk/blob/master/docs/conductors.md) for the composition.

## Encoding

By default, the `compose` command returns the composition encoded as a JSON dictionary:
```
compose demo.js
```
```json
{
    "actions": [
        {
            "name": "/_/authenticate",
            "action": {
                "exec": {
                    "kind": "nodejs:default",
                    "code": "function main({ password }) { return { value: password === 'abc123' } }"
                }
            }
        },
        {
            "name": "/_/success",
            "action": {
                "exec": {
                    "kind": "nodejs:default",
                    "code": "function main() { return { message: 'success' } }"
                }
            }
        },
        {
            "name": "/_/failure",
            "action": {
                "exec": {
                    "kind": "nodejs:default",
                    "code": "function main() { return { message: 'failure' } }"
                }
            }
        }
    ],
    "composition": [
        {
            "type": "if",
            "test": [
                {
                    "type": "action",
                    "name": "/_/authenticate"
                }
            ],
            "consequent": [
                {
                    "type": "action",
                    "name": "/_/success"
                }
            ],
            "alternate": [
                {
                    "type": "action",
                    "name": "/_/failure"
                }
            ]
        }
    ]
}
```
The evaluation context for the Javascript code includes the `composer` object implicitly defined as:
```javascript
composer = require('@ibm-functions/composer')
```

## Deployment

The `--deploy` option makes it possible to deploy a composition (Javascript or JSON) given the desired name for the composition:
```
compose demo.js --deploy demo
```
```
ok: created actions /_/authenticate,/_/success,/_/failure,/_/demo
```
Or:
```
compose demo.js > demo.json
compose demo.json --deploy demo
```
```
ok: created actions /_/authenticate,/_/success,/_/failure,/_/demo
```
The `compose` command synthesizes and deploys a conductor action that implements the
composition with the given name. It also deploys the composed actions if
definitions are provided for them as part of the composition.

The `compose` command outputs the list of deployed actions or an error result. If an error occurs during deployment, the state of the various actions is unknown.

The `compose` command deletes the deployed actions before recreating them if necessary. As a result, default parameters, limits, and annotations on preexisting actions are lost.

### Configuration

Like the OpenWhisk CLI, the `compose` command supports the following flags for specifying the OpenWhisk deployment to use:
```
 --apihost HOST         API HOST
  -u, --auth KEY        authorization KEY
  -i, --insecure        bypass certificate checking
```
If the `--apihost` flag is absent, the environment variable `__OW_API_HOST` is used in its place. If neither is available, the `compose` command attempts to obtain the api host from the whisk property file for the current user.

If the `--auth` flag is absent, the environment variable `__OW_API_KEY` is used in its place. If neither is available, the `compose` command attempts to obtain the authorization key information from the whisk property file for the current user.

The default path for the whisk property file is `$HOME/.wskprops`. It can be altered by setting the `WSK_CONFIG_FILE` environment variable.

## Code generation

The `compose` command returns the code of the conductor action for the composition (Javascript or JSON) when invoked with the `--encode` option:
```
compose demo.js --encode
```
```javascript
const main=(function init(e,t){function r(e,t){return e.slice(-1)[0].next=1,e.push(...t),e}const a=function e(t,a=""){if(Array.isArray(t))return 0===t.length?[{type:"pass",path:a}]:t.map((t,r)=>e(t,a+"["+r+"]")).reduce(r);const n=t.options||{};switch(t.type){case"action":return[{type:"action",name:t.name,path:a}];case"function":return[{type:"function",exec:t.exec,path:a}];case"literal":return[{type:"literal",value:t.value,path:a}];case"finally":var s=e(t.body,a+".body");const l=e(t.finalizer,a+".finalizer");return(o=[[{type:"try",path:a}],s,[{type:"exit",path:a}],l].reduce(r))[0].catch=o.length-l.length,o;case"let":return s=e(t.body,a+".body"),[[{type:"let",let:t.declarations,path:a}],s,[{type:"exit",path:a}]].reduce(r);case"retain":s=e(t.body,a+".body");var o=[[{type:"push",path:a}],s,[{type:"pop",collect:!0,path:a}]].reduce(r);return n.field&&(o[0].field=n.field),o;case"try":s=e(t.body,a+".body");const h=r(e(t.handler,a+".handler"),[{type:"pass",path:a}]);return(o=[[{type:"try",path:a}],s].reduce(r))[0].catch=o.length,o.slice(-1)[0].next=h.length,o.push(...h),o;case"if":var p=e(t.consequent,a+".consequent"),c=r(e(t.alternate,a+".alternate"),[{type:"pass",path:a}]);return n.nosave||(p=r([{type:"pop",path:a}],p)),n.nosave||(c=r([{type:"pop",path:a}],c)),o=r(e(t.test,a+".test"),[{type:"choice",then:1,else:p.length+1,path:a}]),n.nosave||(o=r([{type:"push",path:a}],o)),p.slice(-1)[0].next=c.length,o.push(...p),o.push(...c),o;case"while":return p=e(t.body,a+".body"),c=[{type:"pass",path:a}],n.nosave||(p=r([{type:"pop",path:a}],p)),n.nosave||(c=r([{type:"pop",path:a}],c)),o=r(e(t.test,a+".test"),[{type:"choice",then:1,else:p.length+1,path:a}]),n.nosave||(o=r([{type:"push",path:a}],o)),p.slice(-1)[0].next=1-o.length-p.length,o.push(...p),o.push(...c),o;case"dowhile":var i=e(t.test,a+".test");return n.nosave||(i=r([{type:"push",path:a}],i)),o=[e(t.body,a+".body"),i,[{type:"choice",then:1,else:2,path:a}]].reduce(r),n.nosave?(o.slice(-1)[0].then=1-o.length,o.slice(-1)[0].else=1):(o.push({type:"pop",path:a}),o.slice(-1)[0].next=1-o.length),c=[{type:"pass",path:a}],n.nosave||(c=r([{type:"pop",path:a}],c)),o.push(...c),o}}(t),n=e=>"object"==typeof e&&null!==e&&!Array.isArray(e),s=e=>Promise.reject({code:400,error:e}),o=e=>Promise.reject((e=>({code:"number"==typeof e.code&&e.code||500,error:"string"==typeof e.error&&e.error||e.message||"string"==typeof e&&e||"An internal error occurred"}))(e));return t=>Promise.resolve().then(()=>(function(t){let r=0,p=[];if(void 0!==t.$resume){if(!n(t.$resume))return s("The type of optional $resume parameter must be object");if(r=t.$resume.state,p=t.$resume.stack,void 0!==r&&"number"!=typeof r)return s("The type of optional $resume.state parameter must be number");if(!Array.isArray(p))return s("The type of $resume.stack must be an array");delete t.$resume,c()}function c(){if(n(t)||(t={value:t}),void 0!==t.error)for(t={error:t.error},r=void 0;p.length>0&&"number"!=typeof(r=p.shift().catch););}function i(r){function a(e,t){const r=p.find(t=>void 0!==t.let&&void 0!==t.let[e]);void 0!==r&&(r.let[e]=JSON.parse(JSON.stringify(t)))}const n=p.reduceRight((e,t)=>"object"==typeof t.let?Object.assign(e,t.let):e,{});let s="(function(){try{";for(const e in n)s+=`var ${e}=arguments[1]['${e}'];`;s+=`return eval((${r}))(arguments[0])}finally{`;for(const e in n)s+=`arguments[1]['${e}']=${e};`;s+="}})";try{return e(s)(t,n)}finally{for(const e in n)a(e,n[e])}}for(;;){if(void 0===r)return console.log("Entering final state"),console.log(JSON.stringify(t)),t.error?t:{params:t};const e=a[r];console.log(`Entering state ${r} at path fsm${e.path}`);const n=r;switch(r=void 0===e.next?void 0:n+e.next,e.type){case"choice":r=n+(t.value?e.then:e.else);break;case"try":p.unshift({catch:n+e.catch});break;case"let":p.unshift({let:JSON.parse(JSON.stringify(e.let))});break;case"exit":if(0===p.length)return o(`State ${n} attempted to pop from an empty stack`);p.shift();break;case"push":p.unshift(JSON.parse(JSON.stringify({params:e.field?t[e.field]:t})));break;case"pop":if(0===p.length)return o(`State ${n} attempted to pop from an empty stack`);t=e.collect?{params:p.shift().params,result:t}:p.shift().params;break;case"action":return{action:e.name,params:t,state:{$resume:{state:r,stack:p}}};case"literal":t=JSON.parse(JSON.stringify(e.value)),c();break;case"function":let a;try{a=i(e.exec.code)}catch(e){console.error(e),a={error:`An exception was caught at state ${n} (see log for details)`}}"function"==typeof a&&(a={error:`State ${n} evaluated to a function`}),t=JSON.parse(JSON.stringify(void 0===a?t:a)),c();break;case"pass":c();break;default:return o(`State ${n} has an unknown type`)}}})(t)).catch(o)})(eval,[{"type":"if","test":[{"type":"action","name":"/_/authenticate"}],"consequent":[{"type":"action","name":"/_/success"}],"alternate":[{"type":"action","name":"/_/failure"}]}])
```
This code may be deployed using the OpenWhisk CLI:
```
compose demo.js > demo-conductor.js
wsk action create demo demo-conductor.js -a conductor true
```
```
ok: created action demo
```
The conductor action code does not include definitions for nested actions or compositions.
