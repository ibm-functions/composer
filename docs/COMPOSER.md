# JavaScript Composer API

The [composer](../composer.js) module makes it possible to compose actions programmatically. The module is typically used as illustrated in [samples/demo.js](../samples/demo.js):

```javascript
const composer = require('@ibm-functions/composer')

// author action composition
const app = composer.if('authenticate', /* then */ 'welcome', /* else */ 'login')

// compile action composition
composer.compile(app, 'demo.json')
```

When using the programming shell `fsh` however, there is no need to instantiate the module or invoke compile explicitly. The `demo.js` file can be shortened to:

```javascript
composer.if('authenticate', /* then */ 'welcome', /* else */ 'login')
```

and used as follows:

```bash
$ fsh app create demo demo.js
```

This example program composes actions `authenticate`, `welcome`, and `login` using the `composer.if` composition method. The `composer.compile` method produces a JSON object encoding the composition and optionally writes the object to a file. The compiled composition is shown in [samples/demo.json](../samples/demo.json).

To deploy and run this composition and others, please refer to [README.md](README.md).

## Compositions and Compiled Compositions

All composition methods return a _composition_ object. Composition objects must be _compiled_ using the `composer.compile` method before export or invocation. Compiled compositions objects are JSON objects that obey the specification described in [FORMAT.md](FORMAT.md). They can be converted to and from strings using the `JSON.stringify` and `JSON.parse` methods. In contrast, the format of composition objects is not specified and may change in the future.

### composer.compile(_composition_[, _filename_])

`composer.compile(composition, filename)` compiles the composition object to its JSON representation and writes the JSON object to the file `filename` if specified. It returns the compiled composition object.

## Tasks

Composition methods compose _tasks_. A task is one of the following:

| Type | Description | Examples |
| --:| --- | --- |
| _function task_ | a JavaScript function expression | `params => params` or `function (params) { return params }` |
| _action task_   | an OpenWhisk action | `'/whisk.system/utils/echo'` |
| _composition_ | a composition | `composer.retry(3, 'connect')` |
| _compiled composition_ | a compiled composition | `composer.compile(composer.retry(3, 'connect'))` |

Function expressions occurring in action compositions cannot capture any part of their declaration environment. They may however access and mutate variables in an environment consisting of the variables declared by the [composer.let](#composerletname-value-task_1-task_2-) composition method as discussed below.

Actions are specified by name. Fully qualified names and aliases are supported following the [usual conventions](https://github.com/apache/incubator-openwhisk/blob/master/docs/reference.md).

A function task applies the function to the [parameter object](#parameter-objects-and-error-objects). An action task the invokes the action with the given name on the parameter object. A composition task or compiled composition task applies the composition to the parameter object.

## Parameter Objects and Error Objects

A task is a function that consumes a JSON dictionary (the _input parameter object_) and produces a JSON dictionary (the _output parameter object_). An output parameter object of a task with an `error` field is an _error object_. A task _fails_ if it produces an error object.

Values returned by constant and function tasks are converted to JSON using `JSON.stringify` followed by `JSON.parse`. Values other than JSON dictionaries are replaced with a dictionary with a unique `value` field with the converted value.
For instance, the  task `42` outputs the JSON dictionary `{ value: 42 }`.

By convention, an error object returned by a task is stripped from all fields except from the `error` field. For instance, the task `() => ({ error: 'KO', message: 'OK' })` outputs the JSON dictionary `{ error: 'KO' }`. This is to be consistent with the OpenWhisk action semantics, e.g., the action with code `function main() { return { error: 'KO', message: 'OK' } }` outputs `{ error: 'KO' }`.

## Composition Methods

The following composition methods are currently supported:

| Composition | Description | Example |
| --:| --- | --- | 
| [`task`](#composertasktask-options) | single task | `composer.task('sayHi', { input: 'userInfo' })` |
| [`value`](#composervaluejson) | constant value | `composer.value({ message: 'Hello World!' })` |
| [`sequence`](#composersequencetask_1-task_2-) | sequence | `composer.sequence('getLocation', 'getWeatherForLocation')` |
| [`let`](#composerletname-value-task_1-task_2-) | variables | `composer.let('n', 42, ...)` |
| [`if`](#composerifcondition-consequent-alternate) | conditional | `composer.if('authenticate', /* then */ 'welcome', /* else */ 'login')` |
| [`while`](#composerwhilecondition-task) | loop | `composer.while('needMoreData', 'fetchMoreData')` |
| [`try`](#composertrytask-handler) | error handling | `composer.try('DivideByN', /* catch */ 'NaN')` |
| [`repeat`](#composerrepeatcount-task) | repetition | `composer.repeat(42, 'sayHi')` |
| [`retry`](#composerretrycount-task) | error recovery | `composer.retry(3, 'connect')` |
| [`retain`](#composerretaintask-flag) | parameter retention | `composer.retain('validateInput')` |

### composer.task(_task_[, _options_])

`composer.task(task, options)` is a composition with a single task _task_. The optional _options_ parameter may alter the task behavior as follows:

 * If _options.merge_ evaluates to true the output parameter object for the composition is obtained by merging the output parameter object for the task into the input parameter object (unless the task produces an error object).

   For instance, the composition `composer.task(42, { merge: true })` invoked on the input parameter object `{ value: 0, message: 'OK' }` outputs `{ value: 42, message: 'OK' }`.
 
 * Alternatively if _options.output_ is defined the output parameter object for the composition is obtained by assigning the output parameter object for the task to the _options.output_ field of the input parameter object for the composition. Additionally, if _options.input_ is defined the input parameter for the task is only the value of the field _options.input_ of the input parameter object for the composition as opposed to the full input parameter object.

   For instance, the composition `composer.task(({n}) => ({ n: n+1 }), { input: 'in', output: 'out' })` invoked on the input parameter object `{ in: { n: 42 } }` outputs `{ in: { n: 42 }, out: { n: 43 } }`.
   
   If the value of the _options.input_ field is not a JSON dictionary is it replaced with a dictionary with a unique field `value` with the field's value.

### composer.value(_json_)

`composer.value(json)` outputs _json_ if it is a JSON dictionary. If _json_ is not a JSON dictionary is it replaced with a dictionary with a unique field `value` with value _json_.

The _json_ value may be computed at composition time. For instance, the following composition captures the composition time:

```javascript
composer.value(Date())
```

### composer.sequence(_task\_1_, _task\_2_, ...)

`composer.sequence(task_1, task_2, ...)` runs a sequence of tasks (possibly empty).

The input parameter object for the composition is the input parameter object of the first task in the sequence. The output parameter object of one task in the sequence is the input parameter object for the next task in the sequence. The output parameter object of the last task in the sequence is the output parameter object for the composition.

If one of the tasks fails, the remainder of the sequence is not executed. The output parameter object for the composition is the error object produced by the failed task.

An empty sequence behaves as a sequence with a single function task `params => params`. The output parameter object for the empty sequence is its input parameter object unless it is an error object, in which case, as usual, the error object only contains the `error` field of the input parameter object.

### composer.let(_name_, _value_, _task\_1_, _task\_2_, ...)

`composer.let(name, value, task_1_, _task_2_, ...)` declares a new variable with name _name_ and initial value _value_ and runs a sequence of tasks in the scope of this definition.

Variables declared with `composer.let` may be accessed and mutated by functions __running__ as part of the following sequence (irrespective of their place of definition). In other words, name resolution is [dynamic](https://en.wikipedia.org/wiki/Name_resolution_(programming_languages)#Static_versus_dynamic). If a variable declaration is nested inside a declaration of a variable with the same name, the innermost declaration masks the earlier declarations.

For example, the following composition invokes task `task` repeatedly `n` times.

```javascript
composer.let('i', n, composer.while(() => i-- > 0, task))
```

Observe the first argument to the `let` composition is the quoted variable name `'i'`, whereas occurrences of the variable in the `let` body are not quoted.
We recommend expanding `let` compositions as follows to avoid confusing code editors:

```javascript
let i = 'i'; composer.let(i, n, composer.while(() => i-- > 0, task))
```

Variables declared with `composer.let` are not visible to invoked actions. However, they may be passed as parameters to actions as for instance:

```javascript
let n = 'n'; composer.let(n, 42, () => ({n}), '/whisk.system/utils/echo', (params) => { n = params.n })
```

In this example, the variable `n` is exposed to the invoked action as a field of the input parameter object. Moreover, the value of the `n` field of the output parameter object is assigned back to variable `n`.

### composer.if(_condition_, _consequent_[, _alternate_])

`composer.if(condition, consequent, alternate)` runs either the _consequent_ task if the _condition_ evaluates to true or the _alternate_ task if not. The _condition_ task and _consequent_ task or _alternate_ task are all invoked on the input parameter object for the composition. The output parameter object of the _condition_ task is discarded.

A _condition_ task evaluates to true if and only if it produces a JSON dictionary with a field `value` with the value `true` (i.e., JSON's `true` value). Other fields are ignored. Because JSON values other than dictionaries are implicitly lifted to dictionaries with a `value` field, _condition_ may be a Javascript function returning a Boolean value.

An expression such as `params.n > 0` is not a valid condition (or in general a valid task). One should write instead: `(params) => params.n > 0`.

The _alternate_ task may be omitted.

If _condition_ fails, neither branch is executed.

For examples, the following composition divides parameter `n` by two if it is even.

```javascript
composer.if(({n}) => n % 2 == 0, ({n}) => ({ n: n / 2 }))
```

### composer.while(_condition_, _task_)

`composer.while(condition, task)` runs _task_ repeatedly while _condition_ evaluates to true. The _condition_ task is evaluated before any execution of _task_. See [composer.if](#composerifcondition-consequent-alternate) for a discussion of conditions.

A failure of _condition_ or _task_ interrupts the execution.

### composer.try(_task_, _handler_)

`composer.try(task, handler)` runs _task_ with error handler _handler_.

A _task_ failure triggers the execution of _handler_ with the error object as its input parameter object.

### composer.repeat(_count_, _task_)

`composer.repeat(count, task)` runs _task_ _count_ times. It is equivalent to a sequence with _count_ _task_(s).

### composer.retry(_count_, _task_)

`composer.retry(count, task)` runs _task_ and retries _task_ up to _count_ times if it fails. The output parameter object for the composition is either the output parameter object of the successful _task_ invocation or the error object produced by the last _task_ invocation.

### composer.retain(_task_[, _flag_])

`composer.retain(task[, flag])` runs _task_ on the input parameter object producing an object with two fields `params` and `result` such that `params` is the input parameter object of the composition and `result` is the output parameter object of _task_.

If _task_ fails and _flag_ is true, then the output parameter object for the composition is the combination of the input parameters with the error object. If _task_ fails and _flag_ is false or absent, then the output parameter object for the composition is only the error object.
