# Composer Reference

The [`composer`](../composer.js) Node.js module makes it possible define action [compositions](#compositions) using [combinators](#combinators).

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
```
{
    "message": "failure"
}
```
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

Compositions are implemented by means of OpenWhisk conductor actions. The documentation of [conductor actions](https://github.com/apache/incubator-openwhisk/blob/master/docs/conductors.md) discusses activation records in greater details.

## Compositions

The `compose` command when not invoked with the `--deploy` option returns the composition encoded as a JSON dictionary:
```
compose demo.js
```
```
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
The JSON format is documented in [FORMAT.md](FORMAT.md).

A JSON-encoded composition may be deployed using the `compose` command:
```
compose demo.js > demo.json
compose demo.json --deploy demo
```

## Parameter Objects and Error Objects

A composition, like any action, accepts a JSON dictionary (the _input parameter object_) and produces a JSON dictionary (the _output parameter object_). An output parameter object with an `error` field is an _error object_. A composition _fails_ if it produces an error object.

By convention, an error object returned by a composition is stripped from all fields except from the `error` field. This behavior is consistent with the OpenWhisk action semantics, e.g., the action with code `function main() { return { error: 'KO', message: 'OK' } }` outputs `{ error: 'KO' }`.

## Combinators

The `composer` module offers a number of combinators to define compositions:

| Combinator | Description | Example |
| --:| --- | --- | 
| [`action`](#composeractionname) | action | `composer.action('echo')` |
| [`function`](#composerfunctionfun) | function | `composer.function(({ x, y }) => ({ product: x * y }))` |
| [`literal` or `value`](#composerliteralvalue) | constant value | `composer.literal({ message: 'Hello, World!' })` |
| [`sequence` or `seq`](#composersequencecomposition_1-composition_2) | sequence | `composer.sequence('foo', 'bar')` |
| [`let`](#composerlet-name-value-composition_1-composition_2) | variable declarations | `composer.let({ count: 3, message: 'hello' }, ...)` |
| [`if`](#composerifcondition-consequent-alternate) | conditional | `composer.if('authenticate', 'success', 'failure')` |
| [`while`](#composerwhilecondition-composition) | loop | `composer.while('notEnough', 'doMore')` |
| [`dowhile`](#TODO) | loop at least once | `composer.dowhile('fetchData', 'needMoreData')` |
| [`repeat`](#composerrepeatcount-composition) | counted loop | `composer.repeat(3, 'hello')` |
| [`try`](#composertrycomposition-handler) | error handling | `composer.try('divideByN', 'NaN')` |
| [`finally`](#TODO) | finalization | `composer.finally('tryThis', 'doThatAlways')` |
| [`retry`](#composerretrycount-composition) | error recovery | `composer.retry(3, 'connect')` |
| [`retain`](#composerretaincomposition) | persistence | `composer.retain('validateInput')` |

The `action`, `function`, and `literal` combinators and their synonymous construct compositions respectively from actions, functions, and constant values. The other combinators combine existing compositions to produce new compositions.

Where a composition is expected, the following shorthands are permitted:
 - `name` of type `string` stands for `composer.action(name)`,
 - `fun` of type `function` stands for `composer.function(fun)`,
 - `null` stands for the empty sequence `composer.sequence()`.

### composer.action(_name_)

`composer.action(name)` is a composition with a single action named _name_. It invokes the action named _name_ on the input parameter object for the composition and returns the output parameter object of this action invocation.

The action _name_ may specify the namespace and/or package containing the action following the usual OpenWhisk grammar. If no namespace is specified, the default namespace is assumed. If no package is specified, the default package is assumed.

Examples:
```
composer.action('hello')
composer.action('myPackage/myAction')
composer.action('/whisk.system/utils/echo')
```

### composer.function(_fun_)

`composer.function(fun)` is a composition with a single Javascript function _fun_. It applies the specified function to the input parameter object for the composition.


 - If the function returns a value of type `function`, the composition returns an error object `{ error }`.
 - If the function throws an exception, the composition returns an error object `{ error }`.
 - If the function returns a value of type other than function, the value is first converted to a JSON value using `JSON.stringify` followed by `JSON.parse`. If the resulting JSON value is not a JSON dictionary, the JSON value is then wrapped into a `{ value }` dictionary. The composition returns the final JSON dictionary.
 - If the function does not return a value and does not throw an exception, the composition returns the input parameter object for the composition converted to a JSON dictionary using `JSON.stringify` followed by `JSON.parse`.

Examples:
```
composer.function(params => ({ message: 'Hello ' + params.name }))
composer.function(function (params) { return { error: 'error' } })

function product({ x, y }) { return { product: x * y } }
composer.function(product)
```

#### Environment capture

Functions intended for compositions cannot capture any part of their environment. They may however access and mutate variables in an environment consisting of the variables declared by the [composer.let](#composerletname-value-composition_1-composition_2-) combinator discussed below.

The following is not legal:
```
let name = 'Dave'
composer.function(params => ({ message: 'Hello ' + name }))
```

The following is legal:
```
composer.let({ name: 'Dave' }, composer.function(params => ({ message: 'Hello ' + name })))
```

### composer.literal(_value_)

`composer.literal(value)` outputs a constant JSON dictionary. This dictionary is obtained by first converting the _value_ argument to JSON using `JSON.stringify` followed by `JSON.parse`. If the resulting JSON value is not a JSON dictionary, the JSON value is then wrapped into a `{ value }` dictionary.

The _value_ argument may be computed at composition time. For instance, the following composition captures the date of the composition:

```javascript
composer.literal(Date())
```

### composer.sequence(_composition\_1_, _composition\_2_...)

`composer.sequence(composition_1, composition_2, ...)` chains a series of compositions (possibly empty).

The input parameter object for the composition is the input parameter object of the first composition in the sequence. The output parameter object of one composition in the sequence is the input parameter object for the next composition in the sequence. The output parameter object of the last composition in the sequence is the output parameter object for the composition.

If one of the compositions fails, the remainder of the sequence is not executed. The output parameter object for the composition is the error object produced by the failed composition.

An empty sequence behaves as a sequence with a single function `params => params`. The output parameter object for the empty sequence is its input parameter object unless it is an error object, in which case, as usual, the error object only contains the `error` field of the input parameter object.

### composer.let({ _name_: _value_ }, _composition\_1_, _composition\_2_, ...)

`composer.let({ name: value }, composition_1_, _composition_2_, ...)` declares a new variable with name _name_ and initial value _value_ and runs a sequence of compositions in the scope of this definition.

Variables declared with `composer.let` may be accessed and mutated by functions __running__ as part of the following sequence (irrespective of their place of definition). In other words, name resolution is [dynamic](https://en.wikipedia.org/wiki/Name_resolution_(programming_languages)#Static_versus_dynamic). If a variable declaration is nested inside a declaration of a variable with the same name, the innermost declaration masks the earlier declarations.

For example, the following composition invokes composition `composition` repeatedly `n` times.

```javascript
composer.let({ i: n }, composer.while(() => i-- > 0, composition))
```

Variables declared with `composer.let` are not visible to invoked actions. However, they may be passed as parameters to actions as for instance in:

```javascript
composer.let({ n: 42 }, () => ({ n }), '/whisk.system/utils/echo', params => { n = params.n })
```

In this example, the variable `n` is exposed to the invoked action as a field of the input parameter object. Moreover, the value of the `n` field of the output parameter object is assigned back to variable `n`.

### composer.if(_condition_, _consequent_[, _alternate_])

`composer.if(condition, consequent, alternate)` runs either the _consequent_ composition if the _condition_ evaluates to true or the _alternate_ composition if not. The _condition_ composition and _consequent_ composition or _alternate_ composition are all invoked on the input parameter object for the composition. The output parameter object of the _condition_ composition is discarded.

A _condition_ composition evaluates to true if and only if it produces a JSON dictionary with a field `value` with value `true`. Other fields are ignored. Because JSON values other than dictionaries are implicitly lifted to dictionaries with a `value` field, _condition_ may be a Javascript function returning a Boolean value.

An expression such as `params.n > 0` is not a valid condition (or in general a valid composition). One should write instead `params => params.n > 0`.

The _alternate_ composition may be omitted.

If _condition_ fails, neither branch is executed.

For example, the following composition divides parameter `n` by two if `n` is even.

```javascript
composer.if(params => params.n % 2 == 0, params => { params.n /= 2 })
```

### composer.while(_condition_, _composition_)

`composer.while(condition, composition)` runs _composition_ repeatedly while _condition_ evaluates to true. The _condition_ composition is evaluated before any execution of _composition_. See [composer.if](#composerifcondition-consequent-alternate) for a discussion of conditions.

A failure of _condition_ or _composition_ interrupts the execution. The composition returns the error object from the failed component.

### composer.repeat(_count_, _composition_)

`composer.repeat(count, composition)` runs _composition_ _count_ times. It is equivalent to a sequence with _count_ _composition_(s).

### composer.try(_composition_, _handler_)

`composer.try(composition, handler)` runs _composition_ with error handler _handler_.

A _composition_ failure triggers the execution of _handler_ with the error object as its input parameter object.

### composer.retry(_count_, _composition_)

`composer.retry(count, composition)` runs _composition_ and retries _composition_ up to _count_ times if it fails. The output parameter object for the composition is either the output parameter object of the successful _composition_ invocation or the error object produced by the last _composition_ invocation.

### composer.retain(_composition_)

`composer.retain(composition)` runs _composition_ on the input parameter object producing an object with two fields `params` and `result` such that `params` is the input parameter object of the composition and `result` is the output parameter object of _composition_.
