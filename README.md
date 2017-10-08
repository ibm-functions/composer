Composer is a new programming model from [IBM
Research](https://ibm.biz/serverless-research) for composing [IBM
Cloud Functions](https://ibm.biz/openwhisk), built on [Apache
OpenWhisk](https://github.com/apache/incubator-openwhisk).  Composer
extends Functions and sequences with more powerful control flow and
automatic state management. With it, developers can build even more
serverless applications including using it for IoT, with workflow
orchestration, conversation services, and devops automation, to name a
few examples.

Composer helps you express cloud-native apps that are serverless by
construction: scale automatically, and pay as you go and not for idle
time. Programming compositions for IBM Cloud Functions is done via the
[functions shell](https://github.com/ibm-functions/shell), which
offers a CLI and graphical interface for fast, incremental, iterative,
and local development of serverless apps. Some additional highlights
of the shell include:

* Edit your code and program using your favorite text editor, rather than using a drag-n-drop UI
* Validate your compositions with readily accessible visualizations, without switching tools or using a browser
* Deploy and invoke compositions using familiar CLI commands
* Debug your invocations with either familiar CLI commands or readily accessible visualizations

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

 * [tutorial](docs) for getting started with Composer in the [docs](docs) folder,
 * [composer](composer.js) node.js module to author compositions using JavaScript,
 * [conductor](conductor.js) action code to orchestrate the execution of compositions,
 * [manager](manager.js) node.js module to query the state of compositions,
 * [test-harness](test-harness.js) helper module for testing composer,
 * [redis-promise](redis-promise.js) helper module that implements a promisified redis client for node.js,
 * example compositions in the [samples](samples) folder,
 * unit tests in the [test](test) folder.
