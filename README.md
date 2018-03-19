# Composer

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
be managed using a combination of the Composer [compose](bin/compose) shell
script (for deployment) and the [OpenWhisk
CLI](https://console.bluemix.net/openwhisk/learn/cli) (for configuration, invocation, and
life-cycle management).

**In contrast to earlier releases of Composer, a REDIS server is not required to
run compositions**. Composer now synthesizes OpenWhisk [conductor
actions](https://github.com/apache/incubator-openwhisk/blob/master/docs/conductors.md)
to implement compositions. Compositions have all the attributes and capabilities
of an action (e.g., default parameters, limits, blocking invocation, web
export).

This repository includes:
* the [composer](composer.js) Node.js module for authoring compositions using
  JavaScript,
* the [compose](bin/compose) shell script for deploying compositions,
* [documentation](docs), [examples](samples), and [tests](test).

Composer and Shell are currently available as _IBM Research previews_. As
Composer and Shell continue to evolve, it may be necessary to redeploy existing
compositions to take advantage of new capabilities. However existing
compositions should continue to run fine without redeployment.

## Getting started 
* [Introduction to Serverless Composition](docs/README.md): Setting up your
  programming environment and getting started with Shell and Composer.
* [Building a Translation Slack Bot with Serverless
  Composition](docs/tutorials/translateBot/README.md): A more advanced tutorial
  using Composition to build a serverless Slack chatbot that does language
  translation.
* [Composer Reference](docs/COMPOSER.md): A comprehensive reference manual for
  the Node.js programmer.

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
* [Conductor Actions and Composer v2](https://urldefense.proofpoint.com/v2/url?u=https-3A__youtu.be_qkqenC5b1kE&d=DwIGaQ&c=jf_iaSHvJObTbx-siA1ZOg&r=C3zA0dhyHjF4WaOy8EW8kQHtYUl9-dKPdS8OrjFeQmE&m=vCx7thSf3YtT7x3Pe2DaLYw-dcjU1hNIfDkTM_21ObA&s=MGh9y3vSvssj1xTzwEurJ6TewdE7Dr2Ycs10Tix8sNg&e=) (29:30 minutes into the video): A discussion of the composition runtime.

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

## Feedback and Contributions
We are looking forward your feedback and criticism. We encourage you to [join us on
slack](http://ibm.biz/composer-users). File bugs and we will squash them.

We welcome contributions to Composer and Shell. See
[CONTRIBUTING.md](CONTRIBUTING.md).
