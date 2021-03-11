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

const fqn = require('./fqn')
const fs = require('fs')
const util = require('util')

const version = require('./package.json').version

const isObject = obj => typeof obj === 'object' && obj !== null && !Array.isArray(obj)

// error class
class ComposerError extends Error {
  constructor (message, argument) {
    super(message + (argument !== undefined ? '\nArgument value: ' + util.inspect(argument) : ''))
  }
}

const composer = { util: { declare, version } }

const lowerer = {
  literal (value) {
    return composer.let({ value }, () => value)
  },

  retain (...components) {
    let params = null
    return composer.let(
      { params },
      composer.finally(
        args => { params = args },
        composer.seq(composer.mask(...components),
          result => ({ params, result }))))
  },

  retain_catch (...components) {
    return composer.seq(
      composer.retain(
        composer.finally(
          composer.seq(...components),
          result => ({ result }))),
      ({ params, result }) => ({ params, result: result.result }))
  },

  if (test, consequent, alternate) {
    let params = null
    return composer.let(
      { params },
      composer.finally(
        args => { params = args },
        composer.if_nosave(
          composer.mask(test),
          composer.finally(() => params, composer.mask(consequent)),
          composer.finally(() => params, composer.mask(alternate)))))
  },

  while (test, body) {
    let params = null
    return composer.let(
      { params },
      composer.finally(
        args => { params = args },
        composer.seq(composer.while_nosave(
          composer.mask(test),
          composer.finally(() => params, composer.seq(composer.mask(body), args => { params = args }))),
        () => params)))
  },

  dowhile (body, test) {
    let params = null
    return composer.let(
      { params },
      composer.finally(
        args => { params = args },
        composer.seq(composer.dowhile_nosave(
          composer.finally(() => params, composer.seq(composer.mask(body), args => { params = args })),
          composer.mask(test)),
        () => params)))
  },

  repeat (count, ...components) {
    return composer.let(
      { count },
      composer.while(
        () => count-- > 0,
        composer.mask(...components)))
  },

  retry (count, ...components) {
    return composer.let(
      { count },
      params => ({ params }),
      composer.dowhile(
        composer.finally(({ params }) => params, composer.mask(composer.retain_catch(...components))),
        ({ result }) => result.error !== undefined && count-- > 0),
      ({ result }) => result)
  },

  merge (...components) {
    return composer.seq(composer.retain(...components), ({ params, result }) => Object.assign(params, result))
  }
}

// apply f to all fields of type composition
function visit (composition, f) {
  composition = Object.assign({}, composition) // copy
  const combinator = composition['.combinator']()
  if (combinator.components) {
    composition.components = composition.components.map(f)
  }
  for (let arg of combinator.args || []) {
    if (arg.type === undefined && composition[arg.name] !== undefined) {
      composition[arg.name] = f(composition[arg.name], arg.name)
    }
  }
  return new Composition(composition)
}

// recursively label combinators with the json path
function label (composition) {
  const label = path => (composition, name, array) => {
    const p = path + (name !== undefined ? (array === undefined ? `.${name}` : `[${name}]`) : '')
    composition = visit(composition, label(p)) // copy
    composition.path = p
    return composition
  }
  return label('')(composition)
}

// derive combinator methods from combinator table
// check argument count and map argument positions to argument names
// delegate to Composition constructor for the rest of the validation
function declare (combinators, prefix) {
  if (arguments.length > 2) throw new ComposerError('Too many arguments in "declare"')
  if (!isObject(combinators)) throw new ComposerError('Invalid argument "combinators" in "declare"', combinators)
  if (prefix !== undefined && typeof prefix !== 'string') throw new ComposerError('Invalid argument "prefix" in "declare"', prefix)
  const composer = {}
  for (let key in combinators) {
    const type = prefix ? prefix + '.' + key : key
    const combinator = combinators[key]
    if (!isObject(combinator) || (combinator.args !== undefined && !Array.isArray(combinator.args))) {
      throw new ComposerError(`Invalid "${type}" combinator specification in "declare"`, combinator)
    }
    for (let arg of combinator.args || []) {
      if (typeof arg.name !== 'string') throw new ComposerError(`Invalid "${type}" combinator specification in "declare"`, combinator)
    }
    composer[key] = function () {
      const composition = { type, '.combinator': () => combinator }
      const skip = (combinator.args && combinator.args.length) || 0
      if (!combinator.components && (arguments.length > skip)) {
        throw new ComposerError(`Too many arguments in "${type}" combinator`)
      }
      for (let i = 0; i < skip; ++i) {
        composition[combinator.args[i].name] = arguments[i]
      }
      if (combinator.components) {
        composition.components = Array.prototype.slice.call(arguments, skip)
      }
      return new Composition(composition)
    }
  }
  return composer
}

// composition class
class Composition {
  // weaker instanceof to tolerate multiple instances of this class
  static [Symbol.hasInstance] (instance) {
    return instance.constructor && instance.constructor.name === Composition.name
  }

  // construct a composition object with the specified fields
  constructor (composition) {
    const combinator = composition['.combinator']()
    Object.assign(this, composition)
    for (let arg of combinator.args || []) {
      if (composition[arg.name] === undefined && arg.optional && arg.type !== undefined) continue
      switch (arg.type) {
        case undefined:
          try {
            this[arg.name] = composer.task(arg.optional ? composition[arg.name] || null : composition[arg.name])
          } catch (error) {
            throw new ComposerError(`Invalid argument "${arg.name}" in "${composition.type} combinator"`, composition[arg.name])
          }
          break
        case 'name':
          try {
            this[arg.name] = fqn(composition[arg.name])
          } catch (error) {
            throw new ComposerError(`${error.message} in "${composition.type} combinator"`, composition[arg.name])
          }
          break
        case 'value':
          if (typeof composition[arg.name] === 'function' || composition[arg.name] === undefined) {
            throw new ComposerError(`Invalid argument "${arg.name}" in "${composition.type} combinator"`, composition[arg.name])
          }
          break
        case 'object':
          if (!isObject(composition[arg.name])) {
            throw new ComposerError(`Invalid argument "${arg.name}" in "${composition.type} combinator"`, composition[arg.name])
          }
          break
        default:
          if ('' + typeof composition[arg.name] !== arg.type) {
            throw new ComposerError(`Invalid argument "${arg.name}" in "${composition.type} combinator"`, composition[arg.name])
          }
      }
    }
    if (combinator.components) this.components = (composition.components || []).map(obj => composer.task(obj))
    return this
  }

  // compile composition
  compile () {
    if (arguments.length > 0) throw new ComposerError('Too many arguments in "compile"')

    const actions = []

    const flatten = composition => {
      composition = visit(composition, flatten)
      if (composition.type === 'action' && composition.action) {
        actions.push({ name: composition.name, action: composition.action })
        delete composition.action
      }
      return composition
    }

    const obj = { composition: label(flatten(this)).lower(), ast: this, version }
    if (actions.length > 0) obj.actions = actions
    return obj
  }

  // recursively lower combinators to the desired set of combinators (including primitive combinators)
  lower (combinators = []) {
    if (arguments.length > 1) throw new ComposerError('Too many arguments in "lower"')
    if (!Array.isArray(combinators)) throw new ComposerError('Invalid argument "combinators" in "lower"', combinators)

    const lower = composition => {
      // repeatedly lower root combinator
      while (composition['.combinator']().def) {
        const path = composition.path
        const combinator = composition['.combinator']()
        if (Array.isArray(combinators) && combinators.indexOf(composition.type) >= 0) break
        // map argument names to positions
        const args = []
        const skip = (combinator.args && combinator.args.length) || 0
        for (let i = 0; i < skip; i++) args.push(composition[combinator.args[i].name])
        if (combinator.components) args.push(...composition.components)
        composition = combinator.def(...args)
        if (path !== undefined) composition.path = path // preserve path
      }
      // lower nested combinators
      return visit(composition, lower)
    }

    return lower(this)
  }
}

// primitive combinators
const combinators = {
  sequence: { components: true },
  if_nosave: { args: [{ name: 'test' }, { name: 'consequent' }, { name: 'alternate', optional: true }] },
  while_nosave: { args: [{ name: 'test' }, { name: 'body' }] },
  dowhile_nosave: { args: [{ name: 'body' }, { name: 'test' }] },
  try: { args: [{ name: 'body' }, { name: 'handler' }] },
  finally: { args: [{ name: 'body' }, { name: 'finalizer' }] },
  let: { args: [{ name: 'declarations', type: 'object' }], components: true },
  mask: { components: true },
  action: { args: [{ name: 'name', type: 'name' }, { name: 'action', type: 'object', optional: true }] },
  function: { args: [{ name: 'function', type: 'object' }] },
  async: { components: true },
  parallel: { components: true },
  map: { components: true },
  dynamic: {}
}

Object.assign(composer, declare(combinators))

// derived combinators
const extra = {
  empty: { def: composer.sequence },
  seq: { components: true, def: composer.sequence },
  if: { args: [{ name: 'test' }, { name: 'consequent' }, { name: 'alternate', optional: true }], def: lowerer.if },
  while: { args: [{ name: 'test' }, { name: 'body' }], def: lowerer.while },
  dowhile: { args: [{ name: 'body' }, { name: 'test' }], def: lowerer.dowhile },
  repeat: { args: [{ name: 'count', type: 'number' }], components: true, def: lowerer.repeat },
  retry: { args: [{ name: 'count', type: 'number' }], components: true, def: lowerer.retry },
  retain: { components: true, def: lowerer.retain },
  retain_catch: { components: true, def: lowerer.retain_catch },
  value: { args: [{ name: 'value', type: 'value' }], def: lowerer.literal },
  literal: { args: [{ name: 'value', type: 'value' }], def: lowerer.literal },
  merge: { components: true, def: lowerer.merge },
  par: { components: true, def: composer.parallel }
}

Object.assign(composer, declare(extra))

// add or override definitions of some combinators
Object.assign(composer, {
  // detect task type and create corresponding composition object
  task (task) {
    if (arguments.length > 1) throw new ComposerError('Too many arguments in "task" combinator')
    if (task === undefined) throw new ComposerError('Invalid argument in "task" combinator', task)
    if (task === null) return composer.empty()
    if (task instanceof Composition) return task
    if (typeof task === 'function') return composer.function(task)
    if (typeof task === 'string') return composer.action(task)
    throw new ComposerError('Invalid argument "task" in "task" combinator', task)
  },

  // function combinator: stringify function code
  function (fun) {
    if (arguments.length > 1) throw new ComposerError('Too many arguments in "function" combinator')
    if (typeof fun === 'function') {
      fun = `${fun}`
      if (fun.indexOf('[native code]') !== -1) throw new ComposerError('Cannot capture native function in "function" combinator', fun)
    }
    if (typeof fun === 'string') {
      fun = { kind: 'nodejs:default', code: fun }
    }
    if (!isObject(fun)) throw new ComposerError('Invalid argument "function" in "function" combinator', fun)
    return new Composition({ type: 'function', function: { exec: fun }, '.combinator': () => combinators.function })
  },

  // action combinator
  action (name, options = {}) {
    if (arguments.length > 2) throw new ComposerError('Too many arguments in "action" combinator')
    if (!isObject(options)) throw new ComposerError('Invalid argument "options" in "action" combinator', options)
    let exec
    if (Array.isArray(options.sequence)) { // native sequence
      exec = { kind: 'sequence', components: options.sequence.map(fqn) }
    } else if (typeof options.filename === 'string') { // read action code from file
      exec = fs.readFileSync(options.filename, { encoding: 'utf8' })
    } else if (typeof options.action === 'function') { // capture function
      exec = `const main = ${options.action}`
      if (exec.indexOf('[native code]') !== -1) throw new ComposerError('Cannot capture native function in "action" combinator', options.action)
    } else if (typeof options.action === 'string' || isObject(options.action)) {
      exec = options.action
    }
    if (typeof exec === 'string') {
      exec = { kind: 'nodejs:default', code: exec }
    }
    const composition = { type: 'action', name, '.combinator': () => combinators.action }
    if (exec) {
      composition.action = { exec }
      if (isObject(options.limits)) composition.action.limits = options.limits
    }
    return new Composition(composition)
  },

  // recursively deserialize composition
  parse (composition) {
    if (arguments.length > 1) throw new ComposerError('Too many arguments in "parse" combinator')
    if (!isObject(composition)) throw new ComposerError('Invalid argument "composition" in "parse" combinator', composition)
    const combinator = typeof composition['.combinator'] === 'function' ? composition['.combinator']() : combinators[composition.type]
    if (!isObject(combinator)) throw new ComposerError('Invalid composition type in "parse" combinator', composition)
    return visit(Object.assign({ '.combinator': () => combinator }, composition), composition => composer.parse(composition))
  }
})

module.exports = composer
