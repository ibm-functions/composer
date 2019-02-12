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

# Composer Package

The Composer package consists of:
* the [composer](../composer.js) module for authoring compositions,
* the [conductor](../conductor.js) module for generating conductor actions from
  compositions,
* the [client](../client.js) module for deploying compositions to openwhisk,
* the [compose](../bin/compose.js) and [deploy](../bin/deploy.js) commands for
  managing compositions from the command line.

The documentation for the Composer package is organized as follows:
- [COMPOSITIONS.md](COMPOSITIONS.md) gives a brief introduction to compositions.
- [COMBINATORS.md](COMBINATORS.md) explains the composition constructs.
- [COMMANDS.md](COMMANDS.md) describes the `compose` and `deploy` commands.
