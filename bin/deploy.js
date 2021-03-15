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
const client = require('../client')
const fqn = require('../fqn')
const fs = require('fs')
const json = require('../package.json')
const minimist = require('minimist')
const path = require('path')

const argv = minimist(process.argv.slice(2), {
  string: ['apihost', 'apiversion', 'auth', 'source', 'annotation', 'annotation-file', 'debug', 'kind'],
  boolean: ['insecure', 'version', 'overwrite', 'basic', 'bearer'],
  alias: { auth: 'u', insecure: 'i', version: 'v', annotation: 'a', 'annotation-file': 'A', overwrite: 'w', timeout: 't', memory: 'm', logsize: 'l' }
})

if (argv.version) {
  console.log(json.version)
  process.exit(0)
}

if (argv._.length !== 2 || path.extname(argv._[1]) !== '.json') {
  console.error('Usage:')
  console.error('  deploy composition composition.json [flags]')
  console.error('Flags:')
  console.error('  -a, --annotation KEY=VALUE        add KEY annotation with VALUE')
  console.error('  -A, --annotation-file KEY=FILE    add KEY annotation with FILE content')
  console.error('  --apihost HOST                    API HOST')
  console.error('  --apiversion VERSION              API VERSION')
  console.error('  --basic                           force basic authentication. Note: this option can only be chosen for CF-based namespaces')
  console.error('  --bearer                          force bearer token authentication')
  console.error('  -i, --insecure                    bypass certificate checking')
  console.error('  --kind KIND                       the KIND of the conductor action runtime')
  console.error('  -l, --logsize LIMIT               the maximum log size LIMIT in MB for the conductor action (default 10)')
  console.error('  -m, --memory LIMIT                the maximum memory LIMIT in MB for the conductor action (default 256)')
  console.error('  -t, --timeout LIMIT               the timeout LIMIT in milliseconds for the conductor action (default 60000)')
  console.error('  -u, --auth KEY                    authorization KEY')
  console.error('  -v, --version                     output the composer version')
  console.error('  -w, --overwrite                   overwrite actions if already defined')
  console.error('  --debug LIST                      comma-separated list of debug flags')
  process.exit(1)
}
let composition
try {
  composition = JSON.parse(fs.readFileSync(argv._[1], 'utf8'))
  if (typeof composition !== 'object') throw new Error('Composition must be a dictionary')
  if (typeof composition.ast !== 'object') throw new Error('Composition must have a field "ast" of type dictionary')
  if (typeof composition.composition !== 'object') throw new Error('Composition must have a field "composition" of type dictionary')
  if (typeof composition.version !== 'string') throw new Error('Composition must have a field "version" of type string')
  if (composition.actions !== undefined && !Array.isArray(composition.actions)) throw new Error('Optional field "actions" must be an array')
  composition.composition = composer.parse(composition.composition) // validate composition
  if (typeof argv.annotation === 'string') argv.annotation = [argv.annotation]
  composition.annotations = []
  for (let annotation of [...(argv.annotation || [])]) {
    const index = annotation.indexOf('=')
    if (index < 0) throw Error('Annotation syntax must be "KEY=VALUE"')
    composition.annotations.push({ key: annotation.substring(0, index), value: annotation.substring(index + 1) })
  }
  if (typeof argv['annotation-file'] === 'string') argv['annotation-file'] = [argv['annotation-file']]
  for (let annotation of argv['annotation-file'] || []) {
    const index = annotation.indexOf('=')
    if (index < 0) throw Error('Annotation syntax must be "KEY=FILE"')
    composition.annotations.push({ key: annotation.substring(0, index), value: fs.readFileSync(annotation.substring(index + 1), 'utf8') })
  }
} catch (error) {
  error.statusCode = 422
  console.error(error)
  process.exit(422 - 256) // Unprocessable Entity
}
const options = { ignore_certs: argv.insecure }
if (argv.apihost) options.apihost = argv.apihost
if (argv.auth) options.api_key = argv.auth
if (argv.apiversion) options.apiversion = argv.apiversion
try {
  composition.name = fqn(argv._[0])
} catch (error) {
  error.statusCode = 400
  console.error(error)
  process.exit(400 - 256) // Bad Request
}
if (argv.basic && argv.bearer) {
  throw Error('Must select either basic authentication of bearer token authentication')
}
if (typeof argv.timeout !== 'undefined' && typeof argv.timeout !== 'number') {
  throw Error('Timeout must be a number')
}
if (typeof argv.memory !== 'undefined' && typeof argv.memory !== 'number') {
  throw Error('Maximum memory must be a number')
}
if (typeof argv.logsize !== 'undefined' && typeof argv.logsize !== 'number') {
  throw Error('Maximum log size must be a number')
}
client(options, argv.basic, argv.bearer).compositions.deploy(composition, argv.overwrite, argv.debug, argv.kind, argv.timeout, argv.memory, argv.logsize)
  .then(actions => {
    const names = actions.map(action => action.name)
    console.log(`ok: created action${actions.length > 1 ? 's' : ''} ${names}`)
  })
  .catch(error => {
    error.statusCode = error.statusCode || 500
    console.error(error)
    process.exit(error.statusCode - 256)
  })
