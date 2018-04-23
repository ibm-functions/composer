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
const wsk = composer.openwhisk({ ignore_certs: true })

wsk.compositions.deploy(composer.composition('demo', composition)) // name and deploy composition
    .then(() => wsk.actions.invoke({ name: 'demo', params: { password: 'abc123' }, blocking: true })) // invoke composition
    .then(({ response }) => console.log(JSON.stringify(response.result, null, 4)), console.error)
```
```
node samples/node-demo.js
```
```json
{
    "message": "success"
}
```
Alternatively, the `compose` command can deploy compositions and the OpenWhisk CLI can invoke compositions. See [COMPOSE.md](COMPOSE.md) for details.

# Composer methods

The `composer` object offers a number of combinator methods to define composition objects, e.g., `composer.if`. Combinators are documented in [COMBINATORS.md](COMBINATORS.md). It also offers a series of helper methods described below:

| Combinator | Description | Example |
| --:| --- | --- |
| [`deserialize`](#deserialize) | deserialization | `composer.deserialize(JSON.stringify(composition))` |
| [`lower`](#lower) | lowering | `composer.lower(composer.if('authenticate', 'success', 'failure'), '0.4.0')` |
| [`encode`](#encode) | code generation | `composer.encode(composition, '0.4.0')` |

Finally, the `composer` object object offers an extension to the [OpenWhisk Client for Javascript](https://github.com/apache/incubator-openwhisk-client-js) that supports [deploying](#deployment) compositions.

## Deserialize

`composer.deserialize(composition)` recursively deserializes a serialized composition object. In other words, it recreates a `Composition` object from the input JSON dictionary.

## Lower

`composer.lower(composition, [combinators])` outputs a composition object equivalent to the input `composition` object but using a reduced set of combinators. The optional `combinators` parameter may specify the desired set, either directly as an array of combinator names, e.g., `['retain', 'retry']` or indirectly as a revision of the composer module, e.g., `'0.4.0'`. If the  `combinators` parameter is undefined, the set of combinators is the set of _primitive_ combinators (see [COMBINATORS.md](COMBINATORS.md])). If an array of combinators is specified the primitive combinators are implicitly added to the array. If a `composer` module revision is specified, the target combinator set is the set of combinators available as of the specified revision of the `composer` module. The `combinators` parameter may also have type Boolean. If `combinators === true` only primitive combinators are used. If `combinators === false`, there is no change to the composition.

For instance, `composer.lower(composition, ['retry'])` will preserve any instance of the `retry` combinator but replace other non-primitive combinators sur as `retain`.

## Encode

`composer.encode(composition, [combinators])` first lowers the composition. It then converts compositions nested into `composition` into conductor actions. It finally extracts the action definitions from `composition` (both embedded action definitions and synthesized conductor actions) returning a dictionary with two fields `{ composition, actions }` where `composition` no longer contains any action or composition definitions and `actions` is the corresponding array of extracted action definitions.

The optional `combinators` parameter controls the lowering. See [lower](#lower) for details.

# Deployment

The `composer` object offers an extension to the [OpenWhisk Client for Javascript](https://github.com/apache/incubator-openwhisk-client-js) that supports deploying compositions.

## Openwhisk client

A client instance is obtained by invoking `composer.openwhisk([options])`, for instance with:
```javascript
const wsk = composer.openwhisk({ ignore_certs: true })

```
The specific OpenWhisk deployment to use may be specified via the optional `options` argument, environment variables, or the OpenWhisk property file. Options have priority over environment variables, which have priority over the OpenWhisk property file. Options and environment variables are documented [here](https://github.com/apache/incubator-openwhisk-client-js#constructor-options). The default path for the whisk property file is `$HOME/.wskprops`. It can be altered by setting the `WSK_CONFIG_FILE` environment variable.

The `composer` module adds to the OpenWhisk client instance a new top-level category named `compositions` with a method named `deploy`.

## Deploying compositions

`wsk.compositions.deploy(composition, [combinators])` lowers and deploys the composition `composition`. More precisely, it successively deploys all the actions and compositions defined in `composition` including `composition` itself. The composition `composition` must have a name, hence the `deploy` method is typically used as illustrated above:
```
wsk.compositions.deploy(composer.composition('demo', composition))
```

The optional `combinators` parameter controls the lowering. See [lower](#lower) for details.

The compositions are encoded into conductor actions prior to deployment. In other words, the `deploy` method deploys one or several actions.

The `deploy` method returns a successful promise if all the actions were deployed successfully, or a rejected promise otherwise. In the later, the state of the various actions is unknown.

The `deploy` method deletes the deployed actions before recreating them if necessary. As a result, default parameters, limits, and annotations on preexisting actions are lost.

## Invoking, updating, and deleting compositions

Since compositions are deployed as conductor actions, other management tasks for compositions can be achieved by invoking methods of `wsk.actions`, for instance:
```javascript
wsk.actions.delete('demo')
```
Updating or deleting a conductor action only affect the action itself. It does not affect any other action deployed as part of the composition.
