# Composer Reference

The [`composer`](../composer.js) Node.js module makes it possible define action [compositions](#example) using [combinators](#combinators) and [deploy](#deployment) them.

## Installation

To install the `composer` module use the Node Package Manager:
```
npm -g install @ibm-functions/composer
```
We recommend to install the module globally (with `-g` option) so the `compose`
command is added to the path. Otherwise, it can be found in the `bin` folder of
the module installation.

## Example

A composition is typically defined by means of a Javascript file as illustrated
in [samples/demo.js](samples/demo.js):
```javascript
composer.if(
    composer.action('authenticate', { action: function main({ password }) { return { value: password === 'abc123' } } }),
    composer.action('success', { action: function main() { return { message: 'success' } } }),
    composer.action('failure', { action: function main() { return { message: 'failure' } } }))
```
Composer offers traditional control-flow concepts as methods. These methods
are called _combinators_. This example composition composes three actions named
`authenticate`, `success`, and `failure` using the `composer.if` combinator,
which implements the usual conditional construct. It take three actions (or
compositions) as parameters. It invokes the first one and, depending on the
result of this invocation, invokes either the second or third action.

 This composition includes the definitions of the three composed actions. If the
 actions are defined and deployed elsewhere, the composition code can be shorten
 to:
```javascript
composer.if('authenticate', 'success', 'failure')
```
To deploy this composition use the `compose` command:
```
compose demo.js --deploy demo
```
The `compose` command synthesizes and deploy an action named `demo` that
implements the composition. It also deploys the composed actions if definitions
are provided for them.

The `demo` composition may be invoked like any action, for instance using the
OpenWhisk CLI:
```
wsk action invoke demo -r -p password passw0rd
```
```json
{
    "message": "failure"
}
```

## Activation Records
An invocation of a composition creates a series of activation records:
```
wsk action invoke demo -p password passw0rd
```
```
ok: invoked /_/demo with id 4f91f9ed0d874aaa91f9ed0d87baaa07
```
```
wsk activation list
```
```
activations
fd89b99a90a1462a89b99a90a1d62a8e demo
eaec119273d94087ac119273d90087d0 failure
3624ad829d4044afa4ad829d40e4af60 demo
a1f58ade9b1e4c26b58ade9b1e4c2614 authenticate
3624ad829d4044afa4ad829d40e4af60 demo
4f91f9ed0d874aaa91f9ed0d87baaa07 demo
```
The entry with the earliest start time (`4f91f9ed0d874aaa91f9ed0d87baaa07`) summarizes the invocation of the composition while other entries record later activations caused by the composition invocation. There is one entry for each invocation of a composed action (`a1f58ade9b1e4c26b58ade9b1e4c2614` and `eaec119273d94087ac119273d90087d0`). The remaining entries record the beginning and end of the composition as well as the transitions between the composed actions.

Compositions are implemented by means of OpenWhisk conductor actions. The [documentation of conductor actions](https://github.com/apache/incubator-openwhisk/blob/master/docs/conductors.md) discusses activation records in greater details.

## Deployment

The `compose` command when not invoked with the `--deploy` option returns the composition encoded as a JSON dictionary:
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
The JSON format is documented in [FORMAT.md](FORMAT.md). The format is meant to be stable, self-contained, language-independent, and human-readable. The JSON dictionary includes the definition for the composition as well as definitions of nested actions and compositions (if any).

A JSON-encoded composition may be deployed using the `compose` command:
```
compose demo.js > demo.json
compose demo.json --deploy demo
```
The `compose` command can also produce the code of the conductor action generated for the composition:
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
In contrast to the JSON format, the conductor action code does not include definitions for nested actions or compositions.

## Parameter Objects and Error Objects

A composition, like any action, accepts a JSON dictionary (the _input parameter object_) and produces a JSON dictionary (the _output parameter object_). An output parameter object with an `error` field is an _error object_. A composition _fails_ if it produces an error object.

By convention, an error object returned by a composition is stripped from all fields except from the `error` field. This behavior is consistent with the OpenWhisk action semantics, e.g., the action with code `function main() { return { error: 'KO', message: 'OK' } }` outputs `{ error: 'KO' }`.

## Combinators

The `composer` module offers a number of combinators to define compositions:

| Combinator | Description | Example |
| --:| --- | --- | 
| [`action`](#action) | action | `composer.action('echo')` |
| [`function`](#function) | function | `composer.function(({ x, y }) => ({ product: x * y }))` |
| [`literal` or `value`](#literal) | constant value | `composer.literal({ message: 'Hello, World!' })` |
| [`sequence` or `seq`](#sequence) | sequence | `composer.sequence('hello', 'bye')` |
| [`let`](#let) | variable declarations | `composer.let({ count: 3, message: 'hello' }, ...)` |
| [`if`](#if) | conditional | `composer.if('authenticate', 'success', 'failure')` |
| [`while`](#while) | loop | `composer.while('notEnough', 'doMore')` |
| [`dowhile`](#dowhile) | loop at least once | `composer.dowhile('fetchData', 'needMoreData')` |
| [`repeat`](#repeat) | counted loop | `composer.repeat(3, 'hello')` |
| [`try`](#try) | error handling | `composer.try('divideByN', 'NaN')` |
| [`finally`](#finally) | finalization | `composer.finally('tryThis', 'doThatAlways')` |
| [`retry`](#retry) | error recovery | `composer.retry(3, 'connect')` |
| [`retain`](#retain) | persistence | `composer.retain('validateInput')` |

The `action`, `function`, and `literal` combinators and their synonymous construct compositions respectively from actions, functions, and constant values. The other combinators combine existing compositions to produce new compositions.

Where a composition is expected, the following shorthands are permitted:
 - `name` of type `string` stands for `composer.action(name)`,
 - `fun` of type `function` stands for `composer.function(fun)`,
 - `null` stands for the empty sequence `composer.sequence()`.

### Action

`composer.action(name, [options])` is a composition with a single action named _name_. It invokes the action named _name_ on the input parameter object for the composition and returns the output parameter object of this action invocation.

The action _name_ may specify the namespace and/or package containing the action following the usual OpenWhisk grammar. If no namespace is specified, the default namespace is assumed. If no package is specified, the default package is assumed.

Examples:
```javascript
composer.action('hello')
composer.action('myPackage/myAction')
composer.action('/whisk.system/utils/echo')
```
The optional `options` dictionary makes it possible to provide a definition for the action being composed:
```javascript
// specify the code for the action
composer.action('hello', { action: function main() { return { message: 'hello' } } })
composer.action('hello', { action: "function main() { return { message: 'hello' } }" })
composer.action('hello', {
    action: {
        kind: 'nodejs:default',
        code: "function main() { return { message: 'hello' } }"
    }
})

// specify a file containing the code for the action
composer.action('hello', { filename: 'hello.js' })

// define an action sequence
composer.action('helloAndBye', { sequence: ['hello', 'bye'] })
```

### Function

`composer.function(fun)` is a composition with a single Javascript function _fun_. It applies the specified function to the input parameter object for the composition.
 - If the function returns a value of type `function`, the composition returns an error object.
 - If the function throws an exception, the composition returns an error object. The exception is logged as part of the conductor action invocation.
 - If the function returns a value of type other than function, the value is first converted to a JSON value using `JSON.stringify` followed by `JSON.parse`. If the resulting JSON value is not a JSON dictionary, the JSON value is then wrapped into a `{ value }` dictionary. The composition returns the final JSON dictionary.
 - If the function does not return a value and does not throw an exception, the composition returns the input parameter object for the composition converted to a JSON dictionary using `JSON.stringify` followed by `JSON.parse`.

Examples:
```javascript
composer.function(params => ({ message: 'Hello ' + params.name }))
composer.function(function (params) { return { error: 'error' } })

function product({ x, y }) { return { product: x * y } }
composer.function(product)
```

#### Environment capture

Functions intended for compositions cannot capture any part of their declaration environment. They may however access and mutate variables in an environment consisting of the variables declared by the [composer.let](#composerletname-value-composition_1-composition_2-) combinator discussed below.

The following is not legal:
```javascript
let name = 'Dave'
composer.function(params => ({ message: 'Hello ' + name }))
```
The following is legal:
```javascript
composer.let({ name: 'Dave' }, composer.function(params => ({ message: 'Hello ' + name })))
```

### Literal

`composer.literal(value)` and its synonymous `composer.value(value)` output a constant JSON dictionary. This dictionary is obtained by first converting the _value_ argument to JSON using `JSON.stringify` followed by `JSON.parse`. If the resulting JSON value is not a JSON dictionary, the JSON value is then wrapped into a `{ value }` dictionary.

The _value_ argument may be computed at composition time. For instance, the following composition captures the date at the time the composition is encoded to JSON:
```javascript
composer.literal(Date())
```

### Sequence

`composer.sequence(composition_1, composition_2, ...)` chains a series of compositions (possibly empty).

The input parameter object for the composition is the input parameter object of the first composition in the sequence. The output parameter object of one composition in the sequence is the input parameter object for the next composition in the sequence. The output parameter object of the last composition in the sequence is the output parameter object for the composition.

If one of the components fails, the remainder of the sequence is not executed. The output parameter object for the composition is the error object produced by the failed component.

An empty sequence behaves as a sequence with a single function `params => params`. The output parameter object for the empty sequence is its input parameter object unless it is an error object, in which case, as usual, the error object only contains the `error` field of the input parameter object.

### Let

`composer.let({ name_1: value_1, name_2: value_2, ... }, composition_1_, _composition_2_, ...)` declares one or more variables with the given names and initial values, and runs runs a sequence of compositions in the scope of these declarations.

Variables declared with `composer.let` may be accessed and mutated by functions __running__ as part of the following sequence (irrespective of their place of definition). In other words, name resolution is [dynamic](https://en.wikipedia.org/wiki/Name_resolution_(programming_languages)#Static_versus_dynamic). If a variable declaration is nested inside a declaration of a variable with the same name, the innermost declaration masks the earlier declarations.

For example, the following composition invokes composition `composition` repeatedly `n` times.
```javascript
composer.let({ i: n }, composer.while(() => i-- > 0, composition))
```
Variables declared with `composer.let` are not visible to invoked actions. However, they may be passed as parameters to actions as for instance in:
```javascript
composer.let({ n: 42 }, () => ({ n }), 'increment', params => { n = params.n })
```

In this example, the variable `n` is exposed to the invoked action as a field of the input parameter object. Moreover, the value of the field `n` of the output parameter object is assigned back to variable `n`.

### If

`composer.if(condition, consequent, [alternate], [options])` runs either the _consequent_ composition if the _condition_ evaluates to true or the _alternate_ composition if not.

A _condition_ composition evaluates to true if and only if it produces a JSON dictionary with a field `value` with value `true`. Other fields are ignored. Because JSON values other than dictionaries are implicitly lifted to dictionaries with a `value` field, _condition_ may be a Javascript function returning a Boolean value. An expression such as `params.n > 0` is not a valid condition (or in general a valid composition). One should write instead `params => params.n > 0`. The input parameter object for the composition is the input parameter object for the _condition_ composition.

The _alternate_ composition may be omitted. If _condition_ fails, neither branch is executed.

The optional `options` dictionary supports a `nosave` option. If `options.nosave` is thruthy, the _consequent_ composition or _alternate_ composition is invoked on the output parameter object of the _condition_ composition. Otherwise, the output parameter object of the _condition_ composition is discarded and the _consequent_ composition or _alternate_ composition is invoked on the input parameter object for the composition. For example, the following compositions divide parameter `n` by two if `n` is even:
```javascript
composer.if(params => params.n % 2 === 0, params => { params.n /= 2 })
composer.if(params => { params.value = params.n % 2 === 0 }, params => { params.n /= 2 }, null, { nosave: true })
```
In the first example, the condition function simply returns a Boolean value. The consequent function uses the saved input parameter object to compute `n`'s value. In the second example, the condition function adds a `value` field to the input parameter object. The consequent function applies to the resulting object. In particular, in the second example, the output parameter object for the condition includes the `value` field.

While, the default `nosave == false` behavior is typically more convenient, preserving the input parameter object is not free as it counts toward the parameter size limit for OpenWhisk actions. In essence, the limit on the size of parameter objects processed during the evaluation of the condition is reduced by the size of the saved parameter object. The `nosave` option omits the parameter save, hence preserving the parameter size limit.

### While

`composer.while(condition, body, [options])` runs _body_ repeatedly while _condition_ evaluates to true. The _condition_ composition is evaluated before any execution of the _body_ composition. See [composer.if](#composerifcondition-consequent-alternate) for a discussion of conditions.

A failure of _condition_ or _body_ interrupts the execution. The composition returns the error object from the failed component.

Like `composer.if`, `composer.while` supports a `nosave` option. By default, the output parameter object of the _condition_ composition is discarded and the input parameter object for the _body_ composition is either the input parameter object for the whole composition the first time around or the output parameter object of the previous iteration of _body_. However if `options.nosave` is thruthy, the input parameter object for _body_ is the output parameter object of _condition_. Moreover, the output parameter object for the whole composition is the output parameter object of the last _condition_ evaluation.

For instance, the following composition invoked on dictionary `{ n: 28 }` outputs `{ n: 7 }`:
```javascript
composer.while(params => params.n % 2 === 0, params => { params.n /= 2 })
```
For instance, the following composition invoked on dictionary `{ n: 28 }` outputs `{ n: 7, value: false }`:
```javascript
composer.while(params => { params.value = params.n % 2 === 0 }, params => { params.n /= 2 }, { nosave: true })
```

### Dowhile

`composer.dowhile(condition, body, [options])` is similar to `composer.while(body, condition, [options])` except that _body_ is invoked before _condition_ is evaluated, hence _body_ is always invoked at least once.

### Repeat

`composer.repeat(count, body)` invokes _body_ _count_ times.

### Try

`composer.try(body, handler)` runs _body_ with error handler _handler_.

If _body_ outputs an error object, _handler_ is invoked with this error object as its input parameter object. Otherwise, _handler_ is not run.

### Finally

`composer.finally(body, finalizer)` runs _body_ and then _finalizer_.

The _finalizer_ is invoked in sequence after _body_ even if _body_ returns an error object.

### Retry

`composer.retry(count, body)` runs _body_ and retries _body_ up to _count_ times if it fails. The output parameter object for the composition is either the output parameter object of the successful _body_ invocation or the error object produced by the last _body_ invocation.

### Retain

`composer.retain(body, [options])` runs _body_ on the input parameter object producing an object with two fields `params` and `result` such that `params` is the input parameter object of the composition and `result` is the output parameter object of _body_.

An `options` dictionary object may be specified to alter the default behavior of `composer.retain` in the following ways:
- If `options.catch` is thruthy, the `retain` combinator behavior will be the same even if _body_ returns an error object. Otherwise, if _body_ fails, the output of the `retain` combinator is only the error object (i.e., the input parameter object is not preserved).
- If `options.filter` is a function, the combinator only persists the result of the function application to the input parameter object.
- If `options.field` is a string, the combinator only persists the value of the field of the input parameter object with the given name.
