<!--
#
# Licensed to the Apache Software Foundation (ASF) under one or more
# contributor license agreements.  See the NOTICE file distributed with
# this work for additional information regarding copyright ownership.
# The ASF licenses this file to You under the Apache License, Version 2.0
# (the "License"); you may not use this file except in compliance with
# the License.  You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
-->

# Changelog

## v0.12.0
* Running sequential compositions no longer requires the action runtime to
  contain the `redis` and `uuid` modules.
* The `deploy` command supports additional options:
  * `--logsize` and `--memory` to set limits for the conductor action,
  * `--basic` and `--bearer` to control the authentication method,
  * `--apiversion` to specify the API version of the target OpenWhisk instance.
* The `deploy` method supports passing through `httpOptions`.
* A workaround for Webpack has been implemented (dependency analysis of the
  conductor code).
* The `openwhisk-client-js` module has been updated to version `3.20.0`.
* The documentation has been improved.

## v0.11.0
* Annotate conductor actions with the `provide-api-key` annotation.
* Add `--kind` and `--timeout` flags to `deploy` command.
* Add `--file` and `-o` flags to `compose` command.
* Update documentation.

## v0.10.0

* Add new [parallel](docs/COMBINATORS.md#parallel) and
  [map](docs/COMBINATORS.md#map) combinators to run compositions in parallel
  using a [Redis instance](README.md#parallel-compositions-with-redis) to store
  intermediate results.
* Add [dynamic](docs/COMBINATORS.md#dynamic) combinator to invoke an action with
  a name chosen at run time.
* Add [option](README.md#openwhisk-ssl-configuration) to bypass TLS certificate
  validation failures (off by default).
* Add [API](docs/COMPOSITIONS.md#conductor-actions) to generate the conductor
  action code from a composition.
* Add [control](docs/COMMANDS.md#debug-flag) over `needle` options and logging.

## v0.9.0

* Initial release as an Apache Incubator project.
