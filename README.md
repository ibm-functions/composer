# @ibm-functions/composer

[![Travis](https://travis-ci.org/ibm-functions/composer.svg?branch=master)](https://travis-ci.org/ibm-functions/composer)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Join
Slack](https://img.shields.io/badge/join-slack-9B69A0.svg)](http://slack.openwhisk.org/)

Composer is a new programming model from [IBM
Research](https://ibm.biz/serverless-research) for composing [IBM Cloud
Functions](https://ibm.biz/openwhisk), built on [Apache
OpenWhisk](https://github.com/apache/incubator-openwhisk). With Composer,
developers can build even more serverless applications including using it for
IoT, with workflow orchestration, conversation services, and devops automation,
to name a few examples.

Programming compositions for IBM Cloud Functions is supported by a new developer
tool called [IBM Cloud Shell](https://github.com/ibm-functions/shell), or just
_Shell_. Shell offers a CLI and graphical interface for fast, incremental,
iterative, and local development of serverless applications. While we recommend
using Shell, Shell is not required to work with compositions. Compositions may
be managed using a combination of the Composer [compose](bin/compose) command
(for deployment) and the [OpenWhisk
CLI](https://console.bluemix.net/openwhisk/learn/cli) (for configuration,
invocation, and life-cycle management).

**In contrast to earlier releases of Composer, a Redis server is not required to
run compositions**. Composer now synthesizes OpenWhisk [conductor
actions](https://github.com/apache/incubator-openwhisk/blob/master/docs/conductors.md)
to implement compositions. Compositions have all the attributes and capabilities
of an action (e.g., default parameters, limits, blocking invocation, web
export).

This repository includes:
* the [composer](composer.js) Node.js module for authoring compositions using
  JavaScript,
* the [compose](bin/compose) command for deploying compositions,
* [documentation](docs), [examples](samples), and [tests](test).

Composer and Shell are currently available as _IBM Research previews_. As
Composer and Shell continue to evolve, it may be necessary to redeploy existing
compositions to take advantage of new capabilities. However existing
compositions should continue to run fine without redeployment.

## Installation

Composer is distributed as Node.js package. To install this package, use the
Node Package Manager:
```
npm -g install @ibm-functions/composer
```
We recommend to install the package globally (with `-g` option) if you intend to
use the `compose` command to define and deploy compositions. Use a local install
(without `-g` option) if you intend to use `node` instead. The two installations
can coexist. Shell embeds the Composer package, so there is no need to install
Composer explicitly when using Shell.

## Defining a composition

A composition is typically defined by means of a Javascript expression as
illustrated in [samples/demo.js](samples/demo.js):
```javascript
composer.if(
    composer.action('authenticate', { action: function main({ password }) { return { value: password === 'abc123' } } }),
    composer.action('success', { action: function main() { return { message: 'success' } } }),
    composer.action('failure', { action: function main() { return { message: 'failure' } } }))
```
Compositions compose actions using _combinator_ methods. These methods
implement the typical control-flow constructs of a sequential imperative
programming language. This example composition composes three actions named
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

## Deploying a composition

One way to deploy a composition is to use the `compose` command:
```
compose demo.js --deploy demo
```
```
ok: created /_/authenticate,/_/success,/_/failure,/_/demo
```
The `compose` command synthesizes and deploys an action named `demo` that
implements the composition. It also deploys the composed actions if definitions
are provided for them.

## Running a composition

The `demo` composition may be invoked like any action, for instance using the
OpenWhisk CLI:
```
wsk action invoke demo -p password passw0rd
```
```
ok: invoked /_/demo with id 4f91f9ed0d874aaa91f9ed0d87baaa07
```
The result of this invocation is the result of the last action in the
composition, in this case the `failure` action since the password in incorrect:
```
wsk activation result 4f91f9ed0d874aaa91f9ed0d87baaa07
```
```json
{
    "message": "failure"
}
```
## Execution traces

This invocation creates a trace, i.e., a series of activation records:
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
The entry with the earliest start time (`4f91f9ed0d874aaa91f9ed0d87baaa07`)
summarizes the invocation of the composition while other entries record later
activations caused by the composition invocation. There is one entry for each
invocation of a composed action (`a1f58ade9b1e4c26b58ade9b1e4c2614` and
`eaec119273d94087ac119273d90087d0`). The remaining entries record the beginning
and end of the composition as well as the transitions between the composed
actions.

Compositions are implemented by means of OpenWhisk conductor actions. The
[documentation of conductor
actions](https://github.com/apache/incubator-openwhisk/blob/master/docs/conductors.md)
explains execution traces in greater details.

## Getting started 
* [Introduction to Serverless
  Composition](docs/tutorials/introduction/README.md): Setting up your
  programming environment and getting started with Shell and Composer.
* [Building a Translation Slack Bot with Serverless
  Composition](docs/tutorials/translateBot/README.md): A more advanced tutorial
  using Composition to build a serverless Slack chatbot that does language
  translation.
* [Composer Reference](docs/README.md): A comprehensive reference manual for the
  Node.js programmer.

## Videos
* The [IBM Cloud Shell YouTube
  channel](https://www.youtube.com/channel/UCcu16nIMNclSujJWDOgUI_g) hosts demo
  videos of IBM Cloud Shell, including editing a composition [using a built-in
  editor](https://youtu.be/1wmkSYl7EDM) or [an external
  editor](https://youtu.be/psqoysnVgE4), and [visualizing a composition's
  execution](https://youtu.be/jTaHgDQDZnQ).
* Watch [our presentation at
  Serverlessconf'17](https://acloud.guru/series/serverlessconf/view/ibm-cloud-functions)
  about Composer and Shell.
* [Conductor Actions and Composer
  v2](https://urldefense.proofpoint.com/v2/url?u=https-3A__youtu.be_qkqenC5b1kE&d=DwIGaQ&c=jf_iaSHvJObTbx-siA1ZOg&r=C3zA0dhyHjF4WaOy8EW8kQHtYUl9-dKPdS8OrjFeQmE&m=vCx7thSf3YtT7x3Pe2DaLYw-dcjU1hNIfDkTM_21ObA&s=MGh9y3vSvssj1xTzwEurJ6TewdE7Dr2Ycs10Tix8sNg&e=)
  (29:30 minutes into the video): A discussion of the composition runtime.

## Blog posts
* [Serverless Composition with IBM Cloud
  Functions](https://www.raymondcamden.com/2017/10/09/serverless-composition-with-ibm-cloud-functions/)
* [Building Your First Serverless Composition with IBM Cloud
  Functions](https://www.raymondcamden.com/2017/10/18/building-your-first-serverless-composition-with-ibm-cloud-functions/)
* [Upgrading Serverless Superman to IBM
  Composer](https://www.raymondcamden.com/2017/10/20/upgrading-serverless-superman-to-ibm-composer/)
* [Calling Multiple Serverless Actions and Retaining Values with IBM
  Composer](https://www.raymondcamden.com/2017/10/25/calling-multiple-serverless-actions-and-retaining-values-with-ibm-composer/)
* [Serverless Try/Catch/Finally with IBM
  Composer](https://www.raymondcamden.com/2017/11/22/serverless-trycatchfinally-with-ibm-composer/)
* [Composing functions into
  applications](https://medium.com/openwhisk/composing-functions-into-applications-70d3200d0fac)
* [A composition story: using IBM Cloud Functions to relay SMS to
  email](https://medium.com/openwhisk/a-composition-story-using-ibm-cloud-functions-to-relay-sms-to-email-d67fc65d29c)
* [Data Flows in Serverless Cloud-Native
  Applications](http://heidloff.net/article/serverless-data-flows)
* [Transforming JSON Data in Serverless
  Applications](http://heidloff.net/article/transforming-json-serverless)

## Contributions
We are looking forward to your feedback and criticism. We encourage you to [join
us on slack](http://ibm.biz/composer-users). File bugs and we will squash them.

We welcome contributions to Composer and Shell. See
[CONTRIBUTING.md](CONTRIBUTING.md).
