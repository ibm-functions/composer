<!--
#
# Licensed to the Apache Software Foundation (ASF) under one or more
# contributor license agreements.  See the NOTICE file distributed with
# this work for additional information regarding copyright ownership.
# The ASF licenses this file to You under the Apache License, Version 2.0
# (the "License"); you may not use this file except in compliance with
# the License.  You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
-->

# Combinators

The `composer` module offers a number of combinators to define compositions:

| Combinator | Description | Example |
| --:| --- | --- |
| [`action`](#action) | named action | `composer.action('echo')` |
| [`async`](#async) | asynchronous invocation | `composer.async('compress', 'upload')` |
| [`dowhile` and `dowhile_nosave`](#dowhile) | loop at least once | `composer.dowhile('fetchData', 'needMoreData')` |
| [`dynamic`](#dynamic) | dynamic invocation | `composer.dynamic()`
| [`empty`](#empty) | empty sequence | `composer.empty()`
| [`finally`](#finally) | finalization | `composer.finally('tryThis', 'doThatAlways')` |
| [`function`](#function) | JavaScript function | `composer.function(({ x, y }) => ({ product: x * y }))` |
| [`if` and `if_nosave`](#if) | conditional | `composer.if('authenticate', 'success', 'failure')` |
| [`let`](#let) | variable declarations | `composer.let({ count: 3, message: 'hello' }, ...)` |
| [`literal` or `value`](#literal) | constant value | `composer.literal({ message: 'Hello, World!' })` |
| [`map`](#map) | parallel map | `composer.map('validate', 'compute')` |
| [`mask`](#mask) | variable hiding | `composer.let({ n }, composer.while(_ => n-- > 0, composer.mask(composition)))` |
| [`merge`](#merge) | data augmentation | `composer.merge('hash')` |
| [`parallel` or `par`](#parallel) | parallel composition | `composer.parallel('compress', 'hash')` |
| [`repeat`](#repeat) | counted loop | `composer.repeat(3, 'hello')` |
| [`retain` and `retain_catch`](#retain) | persistence | `composer.retain('validateInput')` |
| [`retry`](#retry) | error recovery | `composer.retry(3, 'connect')` |
| [`sequence` or `seq`](#sequence) | sequence | `composer.sequence('hello', 'bye')` |
| [`task`](#task) | single task | `composer.task('echo')`
| [`try`](#try) | error handling | `composer.try('divideByN', 'NaN')` |
| [`while` and `while_nosave`](#while) | loop | `composer.while('notEnough', 'doMore')` |

The `action`, `function`, and `literal` combinators construct compositions
respectively from OpenWhisk actions, JavaScript functions, and constant values.
The other combinators combine existing compositions to produce new compositions.

## Shorthands

Where a composition is expected, the following shorthands are permitted:
 - `name` of type `string` stands for `composer.action(name)`,
 - `fun` of type `function` stands for `composer.function(fun)`,
 - `null` stands for the empty sequence `composer.empty()`.

## Action

`composer.action(name, [options])` is a composition with a single action named
_name_. It invokes the action named _name_ on the input parameter object for the
composition and returns the output parameter object of this action invocation.

The action _name_ may specify the namespace and/or package containing the action
following the usual OpenWhisk grammar. If no namespace is specified, the default
namespace is assumed. If no package is specified, the default package is
assumed.

Examples:
```javascript
composer.action('hello') // default package
composer.action('myPackage/myAction')
composer.action('/whisk.system/utils/echo')
```
To be clear, if no package is specified, the default package is assumed even if
the composition itself is not deployed to the default package. To invoke an
action from the same package as the composition the [`dynamic`](#dynamic)
combinator may be used as illustrated [below](#example).

### Action definition

The optional `options` dictionary makes it possible to provide a definition for
the action being composed.
```javascript
// specify the code for the action as a function
composer.action('hello', { action: function () { return { message: 'hello' } } })

// specify the code for the action as a function reference
function hello() {
    return { message: 'hello' }
}
composer.action('hello', { action: hello })

// specify the code for the action as a string
composer.action('hello', { action: "const message = 'hello'; function main() { return { message } }" })

// specify the code and runtime for the action
composer.action('hello', {
    action: {
        kind: 'nodejs:8',
        code: "function () { return { message: 'hello' } }"
    }
})

// specify a file containing the code for the action
composer.action('hello', { filename: 'hello.js' })

// specify a sequence of actions
composer.action('helloAndBye', { sequence: ['hello', 'bye'] })
```
The action may be defined by providing the code for the action as a string, as a
JavaScript function, or as a file name. Alternatively, a sequence action may be
defined by providing the list of sequenced actions. The code (specified as a
string) may be annotated with the kind of the action runtime.

### Limits

If a definition is provided for the action, the `options` dictionary may also
specify `limits`, for instance:
```javascript
composer.action('hello', { filename: 'hello.js', limits: { logs: 1, memory: 128, timeout: 10000 } })
```
The `limits` object optionally specifies any combination of:
- the maximum log size LIMIT in MB for the action,
- the maximum memory LIMIT in MB for the action,
- the timeout LIMIT in milliseconds for the action.

### Environment capture in actions

JavaScript functions used to define actions cannot capture any part of their
declaration environment. The following code is not correct as the declaration of
`name` would not be available at invocation time:
```javascript
let name = 'Dave'
composer.action('hello', { action: function main() { return { message: 'Hello ' + name } } })
```
In contrast, the following code is correct as it resolves `name`'s value at
composition time.
```javascript
let name = 'Dave'
composer.action('hello', { action: `function main() { return { message: 'Hello ' + '${name}' } }` })
```

## Function

`composer.function(fun)` is a composition with a single JavaScript function
_fun_. It applies the specified function to the input parameter object for the
composition.
 - If the function returns a value of type `function`, the composition returns
   an error object.
 - If the function throws an exception, the composition returns an error object.
   The exception is logged as part of the conductor action invocation.
 - If the function returns a value of type other than function, the value is
   first converted to a JSON value using `JSON.stringify` followed by
   `JSON.parse`. If the resulting JSON value is not a JSON dictionary, the JSON
   value is then wrapped into a `{ value }` dictionary. The composition returns
   the final JSON dictionary.
 - If the function does not return a value and does not throw an exception, the
   composition returns the input parameter object for the composition converted
   to a JSON dictionary using `JSON.stringify` followed by `JSON.parse`.

Examples:
```javascript
composer.function(params => ({ message: 'Hello ' + params.name }))
composer.function(function () { return { error: 'error' } })

function product({ x, y }) { return { product: x * y } }
composer.function(product)
```

### Environment capture in functions

Functions intended for compositions cannot capture any part of their declaration
environment. They may however access and mutate variables in an environment
consisting of the variables declared by the [let](#let) combinator discussed
below.

The following code is not correct:
```javascript
let name = 'Dave'
composer.function(params => ({ message: 'Hello ' + name }))
```
The following code is correct:
```javascript
composer.let({ name: 'Dave' }, composer.function(params => ({ message: 'Hello ' + name })))
```

## Literal

`composer.literal(value)` and its synonymous `composer.value(value)` output a
constant JSON dictionary. This dictionary is obtained by first converting the
_value_ argument to JSON using `JSON.stringify` followed by `JSON.parse`. If the
resulting JSON value is not a JSON dictionary, the JSON value is then wrapped
into a `{ value }` dictionary.

The _value_ argument may be computed at composition time. For instance, the
following composition captures the date at the time the composition is encoded
to JSON:
```javascript
composer.sequence(
    composer.literal(Date()),
    composer.action('log', { action: params => ({ message: 'Composition time: ' + params.value }) }))
```

JSON values cannot represent functions. Applying `composer.literal` to a value
of type `'function'` will result in an error. Functions embedded in a `value` of
type `'object'`, e.g., `{ f: p => p, n: 42 }` will be silently omitted from the
JSON dictionary. In other words, `composer.literal({ f: p => p, n: 42 })` will
output `{ n: 42 }`.

In general, a function can be embedded in a composition either by using the
`composer.function` combinator, or by embedding the source code for the function
as a string and later using `eval` to evaluate the function code.

## Sequence

`composer.sequence(composition_1, composition_2, ...)` or it synonymous
`composer.seq(composition_1, composition_2, ...)` chain a series of compositions
(possibly empty).

The input parameter object for the composition is the input parameter object of
the first composition in the sequence. The output parameter object of one
composition in the sequence is the input parameter object for the next
composition in the sequence. The output parameter object of the last composition
in the sequence is the output parameter object for the composition.

If one of the components fails (i.e., returns an error object), the remainder of
the sequence is not executed. The output parameter object for the composition is
the error object produced by the failed component.

An empty sequence behaves as a sequence with a single function `params =>
params`. The output parameter object for the empty sequence is its input
parameter object unless it is an error object, in which case, as usual, the
error object only contains the `error` field of the input parameter object.

## Empty

`composer.empty()` is a shorthand for the empty sequence `composer.sequence()`.
It is typically used to make it clear that a composition, e.g., a branch of an
`if` combinator, is intentionally doing nothing.

## Task

`composer.task(composition)` is equivalent to `composer.sequence(composition)`.

## Let

`composer.let({ name_1: value_1, name_2: value_2, ... }, composition_1,
composition_2, ...)` declares one or more variables with the given names and
initial values, and runs a sequence of compositions in the scope of these
declarations.

The initial values must be valid JSON values. In particular, `composer.let({foo:
undefined }, composition)` is incorrect as `undefined` is not representable by a
JSON value. Use `composer.let({ foo: null }, composition)` instead. For the same
reason, initial values cannot be functions, e.g., `composer.let({ foo: params =>
params }, composition)` is incorrect.

Variables declared with `composer.let` may be accessed and mutated by functions
__running__ as part of the following sequence (irrespective of their place of
definition). In other words, name resolution is
[dynamic](https://en.wikipedia.org/wiki/Name_resolution_(programming_languages)#Static_versus_dynamic).
If a variable declaration is nested inside a declaration of a variable with the
same name, the innermost declaration masks the earlier declarations.

For example, the following composition invokes composition `composition`
repeatedly `n` times.
```javascript
composer.let({ i: n }, composer.while(() => i-- > 0, composition))
```
Variables declared with `composer.let` are not visible to invoked actions.
However, they may be passed as parameters to actions as for instance in:
```javascript
composer.let({ n: 42 }, () => ({ n }), 'increment', params => { n = params.n })
```

In this example, the variable `n` is exposed to the invoked action as a field of
the input parameter object. Moreover, the value of the field `n` of the output
parameter object is assigned back to variable `n`.

## Mask

`composer.mask(composition_1, composition_2, ...)` is meant to be used in
combination with the `let` combinator. It runs a sequence of compositions
excluding from their scope the variables declared by the innermost enclosing
`let`. It is typically used to define composition templates that need to
introduce variables.

For instance, the following function is a possible implementation of a repeat
loop:
```javascript
function loop(n, composition) {
    return composer.let({ n }, composer.while(() => n-- > 0, composer.mask(composition)))
}
```
This function takes two parameters: the number of iterations _n_ and the
_composition_ to repeat _n_ times. Here, the `mask` combinator makes sure that
this declaration of _n_ is not visible to _composition_. Thanks to `mask`, the
following example correctly returns `{ value: 12 }`.
```javascript
composer.let({ n: 0 }, loop(3, loop(4, () => ++n)))
```
While composer variables are dynamically scoped, judicious use of the `mask`
combinator can prevent incidental name collision.

## If

`composer.if(condition, consequent, [alternate])` runs either the _consequent_
composition if the _condition_ evaluates to true or the _alternate_ composition
if not.

A _condition_ composition evaluates to true if and only if it produces a JSON
dictionary with a field `value` with value `true`. Other fields are ignored.
Because JSON values other than dictionaries are implicitly lifted to
dictionaries with a `value` field, _condition_ may be a JavaScript function
returning a Boolean value. An expression such as `params.n > 0` is not a valid
condition (or in general a valid composition). One should write instead `params
=> params.n > 0`. The input parameter object for the composition is the input
parameter object for the _condition_ composition.

The _alternate_ composition may be omitted. If _condition_ fails, neither branch
is executed.

The output parameter object of the _condition_ composition is discarded, one the
choice of a branch has been made and the _consequent_ composition or _alternate_
composition is invoked on the input parameter object for the composition. For
example, the following composition divides parameter `n` by two if `n` is even:
```javascript
composer.if(params => params.n % 2 === 0, params => { params.n /= 2 })
```
The `if_nosave` combinator is similar but it does not preserve the input
parameter object, i.e., the _consequent_ composition or _alternate_ composition
is invoked on the output parameter object of _condition_. The following example
also divides parameter `n` by two if `n` is even:
```javascript
composer.if_nosave(params => { params.value = params.n % 2 === 0 }, params => { params.n /= 2 })
```
In the first example, the condition function simply returns a Boolean value. The
consequent function uses the saved input parameter object to compute `n`'s
value. In the second example, the condition function adds a `value` field to the
input parameter object. The consequent function applies to the resulting object.
In particular, in the second example, the output parameter object for the
condition includes the `value` field.

While, the `if` combinator is typically more convenient, preserving the input
parameter object is not free as it counts toward the parameter size limit for
OpenWhisk actions. In essence, the limit on the size of parameter objects
processed during the evaluation of the condition is reduced by the size of the
saved parameter object. The `if_nosave` combinator omits the parameter save,
hence preserving the parameter size limit.

## While

`composer.while(condition, body)` runs _body_ repeatedly while _condition_
evaluates to true. The _condition_ composition is evaluated before any execution
of the _body_ composition. See
[composer.if](#composerifcondition-consequent-alternate) for a discussion of
conditions.

A failure of _condition_ or _body_ interrupts the execution. The composition
returns the error object from the failed component.

The output parameter object of the _condition_ composition is discarded and the
input parameter object for the _body_ composition is either the input parameter
object for the whole composition the first time around or the output parameter
object of the previous iteration of _body_. However, if `while_nosave`
combinator is used, the input parameter object for _body_ is the output
parameter object of _condition_. Moreover, the output parameter object for the
whole composition is the output parameter object of the last _condition_
evaluation.

For instance, the following composition invoked on dictionary `{ n: 28 }`
returns `{ n: 7 }`:
```javascript
composer.while(params => params.n % 2 === 0, params => { params.n /= 2 })
```
For instance, the following composition invoked on dictionary `{ n: 28 }`
returns `{ n: 7, value: false }`:
```javascript
composer.while_nosave(params => { params.value = params.n % 2 === 0 }, params => { params.n /= 2 })
```

## Dowhile

`composer.dowhile(condition, body)` is similar to `composer.while(body,
condition)` except that _body_ is invoked before _condition_ is evaluated, hence
_body_ is always invoked at least once.

Like `while_nosave`, `dowhile_nosave` does not implicitly preserve the parameter
object while evaluating _condition_.

## Repeat

`composer.repeat(count, composition_1, composition_2, ...)` invokes a sequence
of compositions _count_ times.

## Try

`composer.try(body, handler)` runs _body_ with error handler _handler_.

If _body_ returns an error object, _handler_ is invoked with this error object
as its input parameter object. Otherwise, _handler_ is not run.

## Finally

`composer.finally(body, finalizer)` runs _body_ and then _finalizer_.

The _finalizer_ is invoked in sequence after _body_ even if _body_ returns an
error object. The output parameter object of _body_ (error object or not) is the
input parameter object of _finalizer_.

## Retry

`composer.retry(count, composition_1, composition_2, ...)` runs a sequence of
compositions retrying the sequence up to _count_ times if it fails. The output
parameter object for the composition is either the output parameter object of
the successful sequence invocation or the error object produced by the last
sequence invocation.

## Retain

`composer.retain(composition_1, composition_2, ...)` runs a sequence of
compositions on the input parameter object producing an object with two fields
`params` and `result` such that `params` is the input parameter object of the
composition and `result` is the output parameter object of the sequence.

If the sequence fails, the output of the `retain` combinator is only the error
object (i.e., the input parameter object is not preserved). In contrast, the
`retain_catch` combinator always outputs `{ params, result }`, even if `result`
is an error object.

## Merge

`composer.merge(composition_1, composition_2, ...)` runs a sequence of
compositions on the input parameter object and merge the output parameter object
of the sequence into the input parameter object. In other words,
`composer.merge(composition_1, composition_2, ...)` is a shorthand for:
```
composer.seq(composer.retain(composition_1, composition_2, ...), ({ params, result }) => Object.assign(params, result))
```

## Async

The `async` combinator may require an SSL configuration as discussed
[here](../README.md#openwhisk-ssl-configuration).

`composer.async(composition_1, composition_2, ...)` runs a sequence of
compositions asynchronously. It invokes the sequence but does not wait for it to
execute. It immediately returns a dictionary that includes a field named
`activationId` with the activation id for the sequence invocation.

The spawned sequence operates on a copy of the execution context for the parent
composition. Variables declared in the parent are defined for the child and are
initialized with the parent values at the time of the `async`. But mutations or
later declarations in the parent are not visible in the child and vice versa.

## Parallel

Parallel combinators require access to a Redis instance as discussed
[here](../README.md#parallel-compositions-with-redis).

Parallel combinators may require an SSL configuration as discussed
[here](../README.md#openwhisk-ssl-configuration).

`composer.parallel(composition_1, composition_2, ...)` and its synonymous
`composer.par(composition_1, composition_2, ...)` invoke a series of
compositions (possibly empty) in parallel.

This combinator runs _composition_1_, _composition_2_, ... in parallel and waits
for all of these compositions to complete.

The input parameter object for the composition is the input parameter object for
every branch in the composition. The output parameter object for the composition
has a single field named `value` of type array. The elements of the array are
the output parameter objects for the branches in order.

Error results from the branches are included in the array of results like normal
results. In particular, an error result from a branch does not interrupt the
parallel execution of the other branches. Moreover, since errors results are
nested inside an output parameter object with a single `value` field, an error
from a branch does not trigger the execution of the current error handler. The
caller should walk the array and decide if and how to handle errors.

The `composer.let` variables in scope at the `parallel` combinator are in scope
in the branches. But each branch has its own copy of the execution context.
Variable mutations in one branch are not reflected in other branches or in the
parent composition.

## Map

Parallel combinators require access to a Redis instance as discussed
[here](../README.md#parallel-compositions-with-redis).

Parallel combinators may require an SSL configuration as discussed
[here](../README.md#openwhisk-ssl-configuration).

`composer.map(composition_1, composition_2, ...)` makes multiple parallel
invocations of a sequence of compositions.

The input parameter object for the `map` combinator should include an array of
named _value_. The `map` combinator spawns one sequence for each element of this
array. The input parameter object for the nth instance of the sequence is the
nth array element if it is a dictionary or an object with a single field named
`value` with the nth array element as the field value. Fields on the input
parameter object other than the `value` field are discarded. These sequences run
in parallel. The `map` combinator waits for all the sequences to complete. The
output parameter object for the composition has a single field named `value` of
type array. The elements of the array are the output parameter objects for the
branches in order.

Error results from the branches are included in the array of results like normal
results. In particular, an error result from a branch does not interrupt the
parallel execution of the other branches. Moreover, since errors results are
nested inside an output parameter object with a single `value` field, an error
from a branch does not trigger the execution of the current error handler. The
caller should walk the array and decide if and how to handle errors.

The `composer.let` variables in scope at the `map` combinator are in scope in
the branches. But each branch has its own copy of the execution context.
Variable mutations in one branch are not reflected in other branches or in the
parent composition.

## Dynamic

`composer.dynamic()` invokes an action specified by means of the input parameter
object.

The input parameter object for the `dynamic` combinator must be a dictionary
including the following three fields:
- a field `type` with string value `"action"`,
- a field `name` of type string,
- a field `params` of type dictionary.
Other fields of the input parameter object are ignored.

The `dynamic` combinator invokes the action named _name_ with the input
parameter object _params_. The output parameter object for the composition is
the output parameter object of the action invocation.

### Example

The `dynamic` combinator may be used for example to invoke an action that
belongs to the same package as the composition, without having to specify the
package name beforehand.

```javascript
const composer = require('openwhisk-composer')

function invoke (actionShortName) {
  return composer.let(
    { actionShortName },
    params => ({ type: 'action', params, name: process.env.__OW_ACTION_NAME.split('/').slice(0, -1).concat(actionShortName).join('/') }),
    composer.dynamic())
}

module.exports = composer.seq(
  composer.action('echo'), // echo action from the default package
  invoke('echo')           // echo action from the same package as the composition
)
```
In this example, `let` captures the target action short name at compile time
without expanding it to a fully qualified name. Then, at run time, the package
name is obtained from the environment variable `__OW_ACTION_NAME` and combined
with the action short name. Finally, `dynamic` is used to invoke the action.
