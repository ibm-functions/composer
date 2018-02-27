[![Travis](https://travis-ci.org/ibm-functions/composer.svg?branch=master)](https://travis-ci.org/ibm-functions/composer)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Join Slack](https://img.shields.io/badge/join-slack-9B69A0.svg)](http://slack.openwhisk.org/)

Composer is a new programming model from [IBM
Research](https://ibm.biz/serverless-research) for composing [IBM
Cloud Functions](https://ibm.biz/openwhisk), built on [Apache
OpenWhisk](https://github.com/apache/incubator-openwhisk).
With composer, developers can build even more
serverless applications including using it for IoT, with workflow
orchestration, conversation services, and devops automation, to name a
few examples.

Composer extends Functions and sequences with more powerful control
flow and automatic state management.
Composer helps express cloud-native apps that are serverless by
construction: scale automatically, pay as you go and not for idle time.

The [IBM Cloud functions shell](https://github.com/ibm-functions/shell)
offers a CLI and graphical interface for fast, incremental, iterative,
and local development of serverless apps. Some additional highlights
of the shell include:

* Edit your code and program using your favorite text editor, rather than using a drag-n-drop UI.
* Validate compositions with readily accessible visualizations, without switching tools or using a browser.
* Deploy and invoke compositions using familiar CLI commands.
* Debug invocations with either familiar CLI commands or readily accessible visualizations.

Composer and shell are currently available as IBM Research
previews. We are excited about both and are looking forward to what
compositions you build and run using [IBM Cloud
Functions](https://ibm.biz/openwhisk) or directly on [Apache
OpenWhisk](https://github.com/apache/incubator-openwhisk).

We welcome your feedback and criticism. Find bugs and we will squash
them. And will be grateful for your help. As an early adopter, you
will also be among the first to experience even more features planned
for the weeks ahead. We look forward to your feedback and encourage
you to [join us on slack](http://ibm.biz/composer-users).

This repository includes:

 * a [composer](composer.js) node.js module to author compositions using JavaScript,
 * a [compose](bin/compose) shell script for deploying compositions,
 * a [tutorial](docs/README.md),
 * a [reference manual](docs/COMPOSER.md),
 * example compositions in the [samples](samples) folder,
 * tests in the [test](test) folder.
