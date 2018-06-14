# Composer Module

The [`composer`](../composer.js) Node.js module makes it possible define, deploy, and invoke compositions.

## Installation

To install the `composer` module, use the Node Package Manager:
```
npm install @ibm-functions/composer
```
To take advantage of the `compose` command, it may be useful to install the module globally as well (`-g` option).

## Example

The [samples/node-demo.js](../samples/node-demo.js) file illustrates how to define, deploy, and invoke a composition using `node`: 
```javascript

// require the composer module
const composer = require('@ibm-functions/composer')

// define the composition
const composition = composer.if(
    composer.action('authenticate', { action: function ({ password }) { return { value: password === 'abc123' } } }),
    composer.action('success', { action: function () { return { message: 'success' } } }),
    composer.action('failure', { action: function () { return { message: 'failure' } } }))

// instantiate OpenWhisk client
const wsk = composer.util.openwhisk({ ignore_certs: true })

wsk.compositions.deploy('demo', composition) // deploy composition
    .then(() => wsk.actions.invoke({ name: 'demo', params: { password: 'abc123' }, blocking: true })) // invoke composition
    .then(({ response }) => console.log(JSON.stringify(response.result, null, 4)), console.error)
```
node samples/node-demo.js
```
```json
{
    "message": "success"
}
```
Alternatively, the `compose` command can deploy compositions and the OpenWhisk CLI can invoke compositions. See [COMPOSE.md](COMPOSE.md) for details.

# Helper methods

The `composer` object offers a number of combinator methods to define composition objects, e.g., `composer.if`. Combinators are documented in [COMBINATORS.md](COMBINATORS.md). It also offers a series of helper methods via the `composer.util` object.

| Helper method  | Example |
| --:| --- | --- |
| [`version`](#version) | `composer.util.version` |
| [`deserialize`](#deserialize) | `composer.util.deserialize(JSON.stringify(composition))` |
| [`canonical`](#canonical) | `composer.util.canonical('demo')` |
| [`lower`](#lower) | `composer.util.lower(composer.if('authenticate', 'success', 'failure'), '0.4.0')` |
| [`encode`](#encode) | `composer.util.encode('demo', composition, '0.4.0')` |
| [`openwhisk`](#openwhisk-client) | `composer.util.openwhisk()` |

## Version

`composer.util.version` returns the version number for the composer module.

## Deserialize

`composer.util.deserialize(composition)` recursively deserializes a serialized composition object. In other words, it recreates a `Composition` object from the input JSON dictionary.

## Canonical

`composer.util.canonical(name)` attempts to validate and expand the action name `name` to its canonical form.

## Lower

`composer.util.lower(composition, [combinators])` outputs a composition object equivalent to the input `composition` object but using a reduced set of combinators. The optional `combinators` parameter may specify the desired set, either directly as an array of combinator names, e.g., `['retain', 'retry']` or indirectly as a revision of the composer module, e.g., `'0.4.0'`. If the  `combinators` parameter is undefined, the set of combinators is the set of _primitive_ combinators (see [COMBINATORS.md](COMBINATORS.md])). If an array of combinators is specified the primitive combinators are implicitly added to the array. If a `composer` module revision is specified, the target combinator set is the set of combinators available as of the specified revision of the `composer` module.

For instance, `composer.util.lower(composition, ['retry'])` will preserve any instance of the `retry` combinator but replace other non-primitive combinators sur as `retain`.

## Encode

`composer.util.encode(name, composition, [combinators])` first invokes `composer.util.lower` on the composition with the specified `combinators` argument if any. It then encodes the composition as an array of actions. This array consists of all the actions defined as part of the composition plus the conductor action synthesized for the composition itself.

The optional `combinators` parameter controls the optional lowering. See [lower](#lower) for details.

## Openwhisk client

The `composer` object offers an extension to the [OpenWhisk Client for Javascript](https://github.com/apache/incubator-openwhisk-client-js) that supports deploying compositions.

An OpenWhisk client instance is obtained by invoking `composer.util.openwhisk([options])`, for instance with:
```javascript
const wsk = composer.util.openwhisk({ ignore_certs: true })

```
The specific OpenWhisk deployment to use may be specified via the optional `options` argument, environment variables, or the OpenWhisk property file. Options have priority over environment variables, which have priority over the OpenWhisk property file. Options and environment variables are documented [here](https://github.com/apache/incubator-openwhisk-client-js#constructor-options). The default path for the whisk property file is `$HOME/.wskprops`. It can be altered by setting the `WSK_CONFIG_FILE` environment variable.

The `composer` module adds to the OpenWhisk client instance a new top-level category named `compositions` with a method named `deploy`.

### Deploying compositions

`wsk.compositions.deploy(name, composition, [combinators])` optionally lowers, encodes, and deploys the composition `composition`. More precisely, it successively deploys all the actions defined in `composition` as well as `composition` itself (encoded as a conductor action).

The optional `combinators` parameter controls the optional lowering. See [lower](#lower) for details.

The `deploy` method returns a successful promise if all the actions were deployed successfully, or a rejected promise otherwise. In the later, the state of the various actions is unknown.

The `deploy` method deletes the deployed actions before recreating them if necessary. As a result, default parameters, limits, and annotations on preexisting actions are lost.

### Invoking, updating, and deleting compositions

Since compositions are deployed as conductor actions, other management tasks for compositions can be achieved by invoking methods of `wsk.actions`. For example, to delete a composition named `demo`, use command:
```javascript
wsk.actions.delete('demo')
```
Updating or deleting a conductor action only affect the action itself. It does not affect any other action deployed as part of the composition.
