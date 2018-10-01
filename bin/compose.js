#!/usr/bin/env node

/*
 * Copyright 2017-2018 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict'

const composer = require('../composer')
const json = require('../package.json')
const minimist = require('minimist')
const Module = require('module')
const path = require('path')

const argv = minimist(process.argv.slice(2), {
  boolean: ['version', 'ast'],
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
      return require.resolve(request.replace(request.startsWith(json.name + '/') ? json.name : json.name.substring(0, json.name.indexOf('/')), '..'))
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
  console.error('  -v, --version          output the composer version')
  process.exit(1)
}

let composition
try {
  composition = composer.parse(require(path.resolve(argv._[0]))) // load and validate composition
  composition = composition.compile()
} catch (error) {
  error.statusCode = 422
  console.error(error)
  process.exit(422 - 256) // Unprocessable Entity
}
if (argv.ast) composition = composition.ast
console.log(JSON.stringify(composition, null, 4))
