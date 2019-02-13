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

# Commands

The `compose` command compiles composition code to a portable JSON format. The
`deploy` command deploys JSON-encoded compositions. These commands are intended
as a minimal complement to the OpenWhisk CLI. The OpenWhisk CLI already has the
capability to configure, invoke, and delete compositions since these are just
OpenWhisk actions but lacks the capability to create composition actions. The
`compose` and `deploy` commands bridge this gap. They make it possible to deploy
compositions as part of the development cycle or in shell scripts. They do not
replace the OpenWhisk CLI however as they do not duplicate existing OpenWhisk
CLI capabilities.

## Compose

```
compose
```
```
Usage:
  compose composition.js [flags]
Flags:
  --ast                  only output the ast for the composition
  --js                   output the conductor action code for the composition
  -v, --version          output the composer version
  --debug LIST           comma-separated list of debug flags (when using --js flag)
```
The `compose` command takes a Javascript module that exports a composition
object (for example [demo.js](../samples/demo.js)) and compiles this object to a
portable JSON format on the standard output.
```
compose demo.js > demo.json
```
If the `--ast` option is specified, the `compose` command only outputs a JSON
representation of the Abstract Syntax Tree for the composition.

If the `--js` option is specified, the `compose` command outputs the conductor
action code for the composition.

# Deploy

```
deploy
```
```
Usage:
  deploy composition composition.json [flags]
Flags:
  -a, --annotation KEY=VALUE        add KEY annotation with VALUE
  -A, --annotation-file KEY=FILE    add KEY annotation with FILE content
  --apihost HOST                    API HOST
  -i, --insecure                    bypass certificate checking
  -u, --auth KEY                    authorization KEY
  -v, --version                     output the composer version
  -w, --overwrite                   overwrite actions if already defined
  --debug LIST                      comma-separated list of debug flags
```
The `deploy` command deploys a JSON-encoded composition with the given name.
```
deploy demo demo.json -w
```
```
ok: created /_/authenticate,/_/success,/_/failure,/_/demo
```

The `deploy` command synthesizes and deploys a conductor action that implements
the composition with the given name. It also deploys the composed actions for
which definitions are provided as part of the composition.

The `deploy` command outputs the list of deployed actions or an error result. If
an error occurs during deployment, the state of the various actions is unknown.

The `-w` option authorizes the `deploy` command to overwrite existing
definitions. More precisely, it deletes the deployed actions before recreating
them. As a result, default parameters, limits, and annotations on preexisting
actions are lost.

### Annotations

The `deploy` command implicitly annotates the deployed composition action with
the required `conductor` annotations. Other annotations may be specified by
means of the flags:
```
  -a, --annotation KEY=VALUE        add KEY annotation with VALUE
  -A, --annotation-file KEY=FILE    add KEY annotation with FILE content
```

### OpenWhisk instance

Like the OpenWhisk CLI, the `deploy` command supports the following flags for
specifying the OpenWhisk instance to use:
```
  --apihost HOST                    API HOST
  -i, --insecure                    bypass certificate checking
  -u, --auth KEY                    authorization KEY
```
If the `--apihost` flag is absent, the environment variable `__OW_API_HOST` is
used in its place. If neither is available, the `deploy` command extracts the
`APIHOST` key from the whisk property file for the current user.

If the `--insecure` flag is set or the environment variable `__OW_IGNORE_CERTS`
is set to `true`, the `deploy` command ignores SSL certificates validation
failures.

If the `--auth` flag is absent, the environment variable `__OW_API_KEY` is used
in its place. If neither is available, the `deploy` command extracts the `AUTH`
key from the whisk property file for the current user.

The default path for the whisk property file is `$HOME/.wskprops`. It can be
altered by setting the `WSK_CONFIG_FILE` environment variable.

### Debug flag

The `--debug` flag takes a comma-separated list of debugging options.

The `needle` option activates `needle` verbose logging.

The `needle<defaults>` option enables overriding `needle` default parameters.
The specified `defaults` must be be a json dictionary, as for example in:
```
deploy demo demo.json --debug needle<{"connection":"keep-alive","open_timeout":60000}>
```
