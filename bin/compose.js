#!/usr/bin/env node

 /*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict'

const composer = require('../composer')
const conductor = require('../conductor')
const fs = require('fs')
const json = require('../package.json')
const minimist = require('minimist')
const Module = require('module')
const path = require('path')

const argv = minimist(process.argv.slice(2), {
  string: ['debug', 'o'],
  boolean: ['version', 'ast', 'js', 'file'],
  alias: { version: 'v' }
})

if (argv.version) {
  console.log(json.version)
  process.exit(0)
}

// resolve module even if not in default path
const _resolveFilename = Module._resolveFilename
Module._resolveFilename = function (request, parent) {
  if (request.startsWith(json.name)) {
    try {
      return _resolveFilename(request, parent)
    } catch (error) {
      return require.resolve(request.replace(json.name, '..'))
    }
  } else {
    return _resolveFilename(request, parent)
  }
}

if (argv._.length !== 1 || path.extname(argv._[0]) !== '.js') {
  console.error('Usage:')
  console.error('  compose composition.js [flags]')
  console.error('Flags:')
  console.error('  --ast                  only output the ast for the composition')
  console.error('  --file                 write output to a file next to the input file')
  console.error('  --js                   output the conductor action code for the composition')
  console.error('  -o FILE                write output to FILE')
  console.error('  -v, --version          output the composer version')
  console.error('  --debug LIST           comma-separated list of debug flags (when using --js flag)')
  process.exit(1)
}

let composition
let file
try {
  composition = composer.parse(require(path.resolve(argv._[0]))) // load and validate composition
  composition = composition.compile()
} catch (error) {
  error.statusCode = 422
  console.error(error)
  process.exit(422 - 256) // Unprocessable Entity
}
if (argv.js) {
  composition = conductor.generate(composition, argv.debug).action.exec.code
} else {
  if (argv.ast) composition = composition.ast
  composition = JSON.stringify(composition, null, 4)
}
if (argv.o) {
  file = argv.o
} else if (argv.file) {
  const { dir, name } = path.parse(argv._[0])
  file = path.format({ dir, name, ext: argv.js ? '.conductor.js' : '.json' })
}
if (file) {
  fs.writeFileSync(file, composition.concat('\n'), { encoding: 'utf8' })
} else {
  console.log(composition)
}
