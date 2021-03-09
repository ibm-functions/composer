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

# Compositions

Composer makes it possible to assemble actions into rich workflows called
_compositions_. An example composition is described in
[../README.md](../README.md).

## Control flow

Compositions can express the control flow of typical imperative programming
language: sequences, conditionals, loops, structured error handling. This
control flow is specified using _combinator_ methods such as:
- `composer.sequence(firstAction, secondAction)`
- `composer.if(conditionAction, consequentAction, alternateAction)`
- `composer.try(bodyAction, handlerAction)`

Parallel constructs are also available.

Combinators are described in [COMBINATORS.md](COMBINATORS.md).

## Composition objects

Combinators return composition objects, i.e., instances of the `Composition`
class.

## Parameter objects and error objects

A composition, like any action, accepts a JSON dictionary (the _input parameter
object_) and produces a JSON dictionary (the _output parameter object_). An
output parameter object with an `error` field is an _error object_. A
composition _fails_ if it produces an error object.

By convention, an error object returned by a composition is stripped from all
fields except from the `error` field. This behavior is consistent with the
OpenWhisk action semantics, e.g., the action with code `function main() { return
{ error: 'KO', message: 'OK' } }` outputs `{ error: 'KO' }`.

Error objects play a specific role as they interrupt the normal flow of
execution, akin to exceptions in traditional programming languages. For
instance, if a component of a sequence returns an error object, the remainder of
the sequence is not executed. Moreover, if the sequence is enclosed in an error
handling composition like a `composer.try(sequence, handler)` combinator, the
execution continues with the error handler.

### Reserved parameter name

The field name `$composer` is reserved for composer internal use. Compositions
and composed actions should not expect or return parameter objects with a
top-level field named `$composer`.

## Data flow

The invocation of a composition triggers a series of computations (possibly
empty, e.g., for the empty sequence) obtained by chaining the components of the
composition along the path of execution. The input parameter object for the
composition is the input parameter object of the first component in the chain.
The output parameter object of a component in the chain is typically the input
parameter object for the next component if any or the output parameter object
for the composition if this is the final component in the chain.

For example, the composition `composer.sequence('triple', 'increment')` invokes
the `increment` action on the output of the `triple` action.

Some combinators however are designed to alter the default flow of data. For
instance, the `composer.merge('myAction')` composition merges the input and
output parameter objects of `myAction`.

## Components

Components of a compositions can be actions, JavaScript functions, or
compositions.

JavaScript functions can be viewed as simple, anonymous actions that do not need
to be deployed and managed separately from the composition they belong to.
Functions are typically used to alter a parameter object between two actions
that expect different schemas, as in:
```javascript
composer.sequence('getUserNameAndPassword', params => ({ key = btoa(params.user + ':' + params.password) }), 'authenticate')
```
Combinators can be nested, e.g.,
```javascript
composer.if('isEven', 'half', composer.sequence('triple', 'increment'))
```
Compositions can reference other compositions by name. For instance, assuming we
deploy the sequential composition of the `triple` and `increment` actions as the
composition `tripleAndIncrement`, the following code behaves identically to the
previous example:
```javascript
composer.if('isEven', 'half', 'tripleAndIncrement')
```
The behavior of this last composition would be altered if we redefine the
`tripleAndIncrement` composition to do something else, whereas the first example
would not be affected.

## Embedded action definitions

A composition can embed the definitions of none, some, or all the composed
actions as illustrated in [demo.js](../samples/demo.js):
```javascript
composer.if(
    composer.action('authenticate', { action: function ({ password }) { return { value: password === 'abc123' } } }),
    composer.action('success', { action: function () { return { message: 'success' } } }),
    composer.action('failure', { action: function () { return { message: 'failure' } } }))
)
```
Deploying such a composition deploys the embedded actions.

## Conductor actions

Compositions are implemented by means of OpenWhisk [conductor
actions](https://github.com/apache/openwhisk/blob/master/docs/conductors.md).
Compositions have all the attributes and capabilities of an action, e.g.,
default parameters, limits, blocking invocation, web export. Execution
[traces](https://github.com/apache/openwhisk/blob/master/docs/conductors.md#activations)
and
[limits](https://github.com/apache/openwhisk/blob/master/docs/conductors.md#limits)
of compositions follow from conductor actions.

The conductor action code for a composition may be obtained by means of the
`generate` method of the `conductor` module or using the `compose` command with
the `--js` flag. The conductor action code may be deployed using, e.g., the
OpenWhisk CLI.
```
compose demo.js --js > demo-conductor.js
wsk action create demo demo-conductor.js -a conductor true
```
The `conductor` annotation must be set on conductor actions.
