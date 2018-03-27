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

wsk.compositions.deploy(composition, 'demo') // deploy composition
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

# Combinator methods

The `composer` object offers a number of combinator methods to define composition objects, e.g., `composer.if`.  Combinators are documented in [COMBINATORS.md](COMBINATORS.md).

# Deployment

The `composer` object offers an extension to the [OpenWhisk Client for Javascript](https://github.com/apache/incubator-openwhisk-client-js) that supports deploying compositions.

## OpenWhisk method

A client instance is obtained by invoking `composer.openwhisk([options])`, for instance with:
```javascript
const wsk = composer.openwhisk({ ignore_certs: true })

```
The specific OpenWhisk deployment to use may be specified via the optional `options` argument, environment variables, or the OpenWhisk property file. Options have priority over environment variables, which have priority over the OpenWhisk property file. Options and environment variables are documented [here](https://github.com/apache/incubator-openwhisk-client-js#constructor-options). The default path for the whisk property file is `$HOME/.wskprops`. It can be altered by setting the `WSK_CONFIG_FILE` environment variable.

The `composer` module adds to the OpenWhisk client instance a new top-level category named `compositions` with a method named `deploy`.

## Deploy method

`wsk.deploy(composition, [name])` deploys the composition `composition`, giving name `name` to the corresponding conductor action. More precisely, it successively deploys all the actions and compositions defined in `composition` as well as `composition` itself.

The compositions are encoded into conductor actions prior to deployment. In other words, the `deploy` method deploys one or several actions.

The `deploy` method returns a successful promise if all the actions were deployed successfully, or a rejected promise otherwise. In the later, the state of the various actions is unknown.

The `deploy` method deletes the deployed actions before recreating them if necessary. As a result, default parameters, limits, and annotations on preexisting actions are lost.

The `name` argument may be omitted if the `composition` consists of a single action invocation. In this case, `deploy` method only deploys the actions and compositions whose definitions are nested inside `composition`.

## Invoke, Update, and Delete methods

Since compositions are deployed as conductor actions, other management tasks for compositions can be achieved by invoking methods of `wsk.actions`, for instance:
```javascript
wsk.actions.delete('demo')
```
Updating or deleting a conductor action only affect the action itself. It does not affect any other action deployed as part of the composition.
