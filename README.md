[![Travis](https://travis-ci.org/ibm-functions/composer.svg?branch=master)](https://travis-ci.org/ibm-functions/composer)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Join Slack](https://img.shields.io/badge/join-slack-9B69A0.svg)](http://slack.openwhisk.org/)

Composer is a new programming model from [IBM
Research](https://ibm.biz/serverless-research) for composing [IBM
Cloud Functions](https://ibm.biz/openwhisk), built on [Apache
OpenWhisk](https://github.com/apache/incubator-openwhisk).
With composer, developers can build even more serverless applications including using it for IoT, with workflow
orchestration, conversation services, and devops automation, to name a
few examples.

Programming compositions for IBM Cloud Functions is done via a new developer tool called [IBM Cloud Shell](https://github.com/ibm-functions/shell), or just _Shell_. Shell offers a CLI and graphical interface for fast, incremental, iterative, and local development of serverless apps. Composer and shell are currently available as IBM Research previews. We are excited about both and are looking forward to the compositions you build and run using [IBM CloudFunctions](https://ibm.biz/openwhisk) or directly on [Apache
OpenWhisk](https://github.com/apache/incubator-openwhisk).

This repository includes:
* a [composer](composer.js) node.js module to author compositions using JavaScript
* a [compose](bin/compose) shell script for deploying compositions,
* a [tutorial](docs/README.md) for getting started,
* a [reference manual](docs/COMPOSER.md),
* example compositions in the [samples](samples) folder,
* tests in the [test](test) folder.

## Getting started 
* [Introduction to Serverless Composition](docs/README.md): Setting up your programming environment and getting started with Shell and Composer 
* [Building a Serverless Translate Bot with Composition](docs/tutorials/translateBot/README.md): A more advanced tutorial that describes using Composition to build a serverless Slack chatbot that does language translation. 
* [Learning more about Composer](docs/COMPOSER.md), a Node.js module to author compositions using JavaScript

## Videos
* [IBM Cloud Shell YouTube channel](https://www.youtube.com/channel/UCcu16nIMNclSujJWDOgUI_g): The channel hosts demo videos of IBM Cloud Shell, including editing a composition [using a built-in editor](https://youtu.be/1wmkSYl7EDM) or [an external editor](https://youtu.be/psqoysnVgE4), and [visualizing a composition's execution](https://youtu.be/jTaHgDQDZnQ). 
* Watch [our presentation at Serverlessconf'17](https://acloud.guru/series/serverlessconf/view/ibm-cloud-functions) about Composition and Shell 

## Example applications
* A _Serverless Superman_ [Twitter Bot](https://www.raymondcamden.com/2017/10/20/upgrading-serverless-superman-to-ibm-composer/)
* An app that [relays SMS to email](https://medium.com/openwhisk/a-composition-story-using-ibm-cloud-functions-to-relay-sms-to-email-d67fc65d29c) 

## Feedback
We welcome your feedback and criticism. Find bugs and we will squash
them. And will be grateful for your help. As an early adopter, you
will also be among the first to experience even more features planned
for the weeks ahead. We look forward to your feedback and encourage
you to [join us on slack](http://ibm.biz/composer-users).
