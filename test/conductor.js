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

/* eslint-env mocha */

'use strict'

const assert = require('assert')
const composer = require('../composer')
const wsk = require('../client')()
const name = 'TestAction'

// deploy action
const define = action => wsk.actions.delete(action.name).catch(() => { }).then(() => wsk.actions.create(action))

// deploy and invoke composition
const invoke = (composition, params = {}, blocking = true) => wsk.compositions.deploy(Object.assign({ name }, composition.compile()), true)
  .then(() => wsk.actions.invoke({ name, params, blocking }))
  .then(activation => activation.response.success ? activation : Promise.reject(Object.assign(new Error(), { error: activation })))

// redis configuration
const redis = process.env.REDIS ? { uri: process.env.REDIS } : false
if (process.env.REDIS && process.env.REDIS_CA) redis.ca = process.env.REDIS_CA

// openwhisk configuration
const openwhisk = process.env.__OW_IGNORE_CERTS ? { ignore_certs: true } : {}

describe('composer', function () {
  let n, x, y // dummy variables

  this.timeout(60000)

  before('deploy test actions', function () {
    if (!redis) console.error('------------------------------------------------\nMissing redis configuration, skipping some tests\n------------------------------------------------')
    return define({ name: 'echo', action: 'const main = x=>x' })
      .then(() => define({ name: 'DivideByTwo', action: 'function main({n}) { return { n: n / 2 } }' }))
      .then(() => define({ name: 'TripleAndIncrement', action: 'function main({n}) { return { n: n * 3 + 1 } }' }))
      .then(() => define({ name: 'isNotOne', action: 'function main({n}) { return { value: n != 1 } }' }))
      .then(() => define({ name: 'isEven', action: 'function main({n}) { return { value: n % 2 == 0 } }' }))
      .then(() => wsk.compositions.deploy(Object.assign({ name: '_DivideByTwo' }, composer.seq('DivideByTwo').compile()), true))
  })

  describe('blocking invocations', function () {
    describe('actions', function () {
      it('action must return true', function () {
        return invoke(composer.action('isNotOne'), { n: 0 }).then(activation => assert.deepStrictEqual(activation.response.result, { value: true }))
      })

      it('action must return false', function () {
        return invoke(composer.action('isNotOne'), { n: 1 }).then(activation => assert.deepStrictEqual(activation.response.result, { value: false }))
      })

      it('action must return activationId', function () {
        return invoke(composer.async('isNotOne'), { n: 1, $composer: { openwhisk } }).then(activation => assert.ok(activation.response.result.activationId))
      })

      it('action name must parse to fully qualified', function () {
        let combos = [
          { n: 42, s: false, e: 'Name must be a string' },
          { n: '', s: false, e: 'Name is not valid' },
          { n: ' ', s: false, e: 'Name is not valid' },
          { n: '/', s: false, e: 'Name is not valid' },
          { n: '//', s: false, e: 'Name is not valid' },
          { n: '/a', s: false, e: 'Name is not valid' },
          { n: '/a/b/c/d', s: false, e: 'Name is not valid' },
          { n: '/a/b/c/d/', s: false, e: 'Name is not valid' },
          { n: 'a/b/c/d', s: false, e: 'Name is not valid' },
          { n: '/a/ /b', s: false, e: 'Name is not valid' },
          { n: 'a', e: false, s: '/_/a' },
          { n: 'a/b', e: false, s: '/_/a/b' },
          { n: 'a/b/c', e: false, s: '/a/b/c' },
          { n: '/a/b', e: false, s: '/a/b' },
          { n: '/a/b/c', e: false, s: '/a/b/c' }
        ]
        combos.forEach(({ n, s, e }) => {
          if (s) {
            // good cases
            assert.ok(composer.action(n).name, s)
          } else {
            // error cases
            try {
              composer.action(n)
              assert.fail()
            } catch (error) {
              assert.ok(error.message.startsWith(e))
            }
          }
        })
      })

      it('invalid options', function () {
        try {
          invoke(composer.action('foo', 42))
          assert.fail()
        } catch (error) {
          assert.ok(error.message.startsWith('Invalid argument'))
        }
      })

      it('too many arguments', function () {
        try {
          invoke(composer.action('foo', {}, 'foo'))
          assert.fail()
        } catch (error) {
          assert.ok(error.message.startsWith('Too many arguments'))
        }
      })
    })

    describe('dynamic', function () {
      it('dynamic action invocation', function () {
        return invoke(composer.dynamic(), { type: 'action', name: 'DivideByTwo', params: { n: 42 } }).then(activation => assert.deepStrictEqual(activation.response.result, { n: 21 }))
      })

      it('missing type', function () {
        return invoke(composer.dynamic(), { name: 'DivideByTwo', params: { n: 42 } }).then(() => assert.fail(), activation => assert.ok(activation.error.response.result.error))
      })

      it('invalid type', function () {
        return invoke(composer.dynamic(), { type: 42, name: 'DivideByTwo', params: { n: 42 } }).then(() => assert.fail(), activation => assert.ok(activation.error.response.result.error))
      })

      it('missing name', function () {
        return invoke(composer.dynamic(), { type: 'action', params: { n: 42 } }).then(() => assert.fail(), activation => assert.ok(activation.error.response.result.error))
      })

      it('missing params', function () {
        return invoke(composer.dynamic(), { type: 'action', name: 'DivideByTwo' }).then(() => assert.fail(), activation => assert.ok(activation.error.response.result.error))
      })
    })

    describe('literals', function () {
      it('true', function () {
        return invoke(composer.literal(true)).then(activation => assert.deepStrictEqual(activation.response.result, { value: true }))
      })

      it('42', function () {
        return invoke(composer.literal(42)).then(activation => assert.deepStrictEqual(activation.response.result, { value: 42 }))
      })

      it('invalid argument', function () {
        try {
          invoke(composer.literal(invoke))
          assert.fail()
        } catch (error) {
          assert.ok(error.message.startsWith('Invalid argument'))
        }
      })

      it('too many arguments', function () {
        try {
          invoke(composer.literal('foo', 'foo'))
          assert.fail()
        } catch (error) {
          assert.ok(error.message.startsWith('Too many arguments'))
        }
      })
    })

    describe('functions', function () {
      it('function must return true', function () {
        return invoke(composer.function(({ n }) => n % 2 === 0), { n: 4 }).then(activation => assert.deepStrictEqual(activation.response.result, { value: true }))
      })

      it('function must return false', function () {
        return invoke(composer.function(function ({ n }) { return n % 2 === 0 }), { n: 3 }).then(activation => assert.deepStrictEqual(activation.response.result, { value: false }))
      })

      it('function must fail', function () {
        return invoke(composer.function(() => n)).then(() => assert.fail(), activation => assert.ok(activation.error.response.result.error))
      })

      it('function must throw', function () {
        return invoke(composer.function(() => ({ error: 'foo', n: 42 }))).then(() => assert.fail(), activation => assert.deepStrictEqual(activation.error.response.result, { error: 'foo' }))
      })

      it('function must mutate params', function () {
        return invoke(composer.function(params => { params.foo = 'foo' }), { n: 42 }).then(activation => assert.deepStrictEqual(activation.response.result, { foo: 'foo', n: 42 }))
      })

      it('function as string', function () {
        return invoke(composer.function('({ n }) => n % 2 === 0'), { n: 4 }).then(activation => assert.deepStrictEqual(activation.response.result, { value: true }))
      })

      it('function may return a promise', function () {
        return invoke(composer.function(({ n }) => Promise.resolve(n % 2 === 0)), { n: 4 }).then(activation => assert.deepStrictEqual(activation.response.result, { value: true }))
      })

      it('invalid argument', function () {
        try {
          invoke(composer.function(42))
          assert.fail()
        } catch (error) {
          assert.ok(error.message.startsWith('Invalid argument'))
        }
      })

      it('too many arguments', function () {
        try {
          invoke(composer.function(() => n, () => { }))
          assert.fail()
        } catch (error) {
          assert.ok(error.message.startsWith('Too many arguments'))
        }
      })
    })

    describe('deserialize', function () {
      it('should deserialize a serialized composition', function () {
        const json = {
          'type': 'sequence',
          'components': [{
            'type': 'action',
            'name': 'echo'
          }, {
            'type': 'action',
            'name': 'echo'
          }]
        }
        return invoke(composer.parse(json), { message: 'hi' }).then(activation => assert.deepStrictEqual(activation.response.result, { message: 'hi' }))
      })
    })

    describe('tasks', function () {
      describe('action tasks', function () {
        it('action must return true', function () {
          return invoke(composer.task('isNotOne'), { n: 0 }).then(activation => assert.deepStrictEqual(activation.response.result, { value: true }))
        })
      })

      describe('function tasks', function () {
        it('function must return true', function () {
          return invoke(composer.task(({ n }) => n % 2 === 0), { n: 4 }).then(activation => assert.deepStrictEqual(activation.response.result, { value: true }))
        })
      })

      describe('null task', function () {
        it('null task must return input', function () {
          return invoke(composer.task(null), { foo: 'foo' }).then(activation => assert.deepStrictEqual(activation.response.result, { foo: 'foo' }))
        })

        it('null task must fail on error input', function () {
          return invoke(composer.task(null), { error: 'foo' }).then(() => assert.fail(), activation => assert.deepStrictEqual(activation.error.response.result, { error: 'foo' }))
        })
      })

      describe('invalid tasks', function () {
        it('a Boolean is not a valid task', function () {
          try {
            invoke(composer.task(false))
            assert.fail()
          } catch (error) {
            assert.ok(error.message.startsWith('Invalid argument'))
          }
        })

        it('a number is not a valid task', function () {
          try {
            invoke(composer.task(42))
            assert.fail()
          } catch (error) {
            assert.ok(error.message.startsWith('Invalid argument'))
          }
        })

        it('a dictionary is not a valid task', function () {
          try {
            invoke(composer.task({ foo: 'foo' }))
            assert.fail()
          } catch (error) {
            assert.ok(error.message.startsWith('Invalid argument'))
          }
        })
      })

      it('too many arguments', function () {
        try {
          invoke(composer.task('foo', 'foo'))
          assert.fail()
        } catch (error) {
          assert.ok(error.message.startsWith('Too many arguments'))
        }
      })
    })

    describe('combinators', function () {
      describe('sequence', function () {
        it('flat', function () {
          return invoke(composer.sequence('TripleAndIncrement', 'DivideByTwo', 'DivideByTwo'), { n: 5 })
            .then(activation => assert.deepStrictEqual(activation.response.result, { n: 4 }))
        })

        it('nested right', function () {
          return invoke(composer.sequence('TripleAndIncrement', composer.sequence('DivideByTwo', 'DivideByTwo')), { n: 5 })
            .then(activation => assert.deepStrictEqual(activation.response.result, { n: 4 }))
        })

        it('nested left', function () {
          return invoke(composer.sequence(composer.sequence('TripleAndIncrement', 'DivideByTwo'), 'DivideByTwo'), { n: 5 })
            .then(activation => assert.deepStrictEqual(activation.response.result, { n: 4 }))
        })

        it('seq', function () {
          return invoke(composer.seq('TripleAndIncrement', 'DivideByTwo', 'DivideByTwo'), { n: 5 })
            .then(activation => assert.deepStrictEqual(activation.response.result, { n: 4 }))
        })
      })

      describe('parallel', function () {
        const test = redis ? it : it.skip
        test('parallel', function () {
          return invoke(composer.parallel('TripleAndIncrement', 'DivideByTwo'), { n: 42, $composer: { redis, openwhisk } })
            .then(activation => assert.deepStrictEqual(activation.response.result, { value: [{ n: 127 }, { n: 21 }] }))
        })

        test('par', function () {
          return invoke(composer.par('DivideByTwo', 'TripleAndIncrement', 'isEven'), { n: 42, $composer: { redis, openwhisk } })
            .then(activation => assert.deepStrictEqual(activation.response.result, { value: [{ n: 21 }, { n: 127 }, { value: true }] }))
        })

        test('map', function () {
          return invoke(composer.map('TripleAndIncrement', 'DivideByTwo'), { value: [{ n: 3 }, { n: 5 }, { n: 7 }], $composer: { redis, openwhisk } })
            .then(activation => assert.deepStrictEqual(activation.response.result, { value: [{ n: 5 }, { n: 8 }, { n: 11 }] }))
        })
      })

      describe('if', function () {
        it('condition = true', function () {
          return invoke(composer.if('isEven', 'DivideByTwo', 'TripleAndIncrement'), { n: 4 })
            .then(activation => assert.deepStrictEqual(activation.response.result, { n: 2 }))
        })

        it('condition = false', function () {
          return invoke(composer.if('isEven', 'DivideByTwo', 'TripleAndIncrement'), { n: 3 })
            .then(activation => assert.deepStrictEqual(activation.response.result, { n: 10 }))
        })

        it('condition = true, then branch only', function () {
          return invoke(composer.if('isEven', 'DivideByTwo'), { n: 4 })
            .then(activation => assert.deepStrictEqual(activation.response.result, { n: 2 }))
        })

        it('condition = false, then branch only', function () {
          return invoke(composer.if('isEven', 'DivideByTwo'), { n: 3 })
            .then(activation => assert.deepStrictEqual(activation.response.result, { n: 3 }))
        })

        it('condition = true, nosave option', function () {
          return invoke(composer.if_nosave('isEven', params => { params.then = true }, params => { params.else = true }), { n: 2 })
            .then(activation => assert.deepStrictEqual(activation.response.result, { value: true, then: true }))
        })

        it('condition = false, nosave option', function () {
          return invoke(composer.if_nosave('isEven', params => { params.then = true }, params => { params.else = true }), { n: 3 })
            .then(activation => assert.deepStrictEqual(activation.response.result, { value: false, else: true }))
        })

        it('too many arguments', function () {
          try {
            invoke(composer.if('isEven', 'DivideByTwo', 'TripleAndIncrement', 'TripleAndIncrement'))
            assert.fail()
          } catch (error) {
            assert.ok(error.message.startsWith('Too many arguments'))
          }
        })
      })

      describe('while', function () {
        it('a few iterations', function () {
          return invoke(composer.while('isNotOne', ({ n }) => ({ n: n - 1 })), { n: 4 })
            .then(activation => assert.deepStrictEqual(activation.response.result, { n: 1 }))
        })

        it('no iteration', function () {
          return invoke(composer.while(() => false, ({ n }) => ({ n: n - 1 })), { n: 1 })
            .then(activation => assert.deepStrictEqual(activation.response.result, { n: 1 }))
        })

        it('nosave option', function () {
          return invoke(composer.while_nosave(({ n }) => ({ n, value: n !== 1 }), ({ n }) => ({ n: n - 1 })), { n: 4 })
            .then(activation => assert.deepStrictEqual(activation.response.result, { value: false, n: 1 }))
        })

        it('too many arguments', function () {
          try {
            invoke(composer.while('isNotOne', ({ n }) => ({ n: n - 1 }), ({ n }) => ({ n: n - 1 })), { n: 4 })
            assert.fail()
          } catch (error) {
            assert.ok(error.message.startsWith('Too many arguments'))
          }
        })
      })

      describe('dowhile', function () {
        it('a few iterations', function () {
          return invoke(composer.dowhile(({ n }) => ({ n: n - 1 }), 'isNotOne'), { n: 4 })
            .then(activation => assert.deepStrictEqual(activation.response.result, { n: 1 }))
        })

        it('one iteration', function () {
          return invoke(composer.dowhile(({ n }) => ({ n: n - 1 }), () => false), { n: 1 })
            .then(activation => assert.deepStrictEqual(activation.response.result, { n: 0 }))
        })

        it('nosave option', function () {
          return invoke(composer.dowhile_nosave(({ n }) => ({ n: n - 1 }), ({ n }) => ({ n, value: n !== 1 })), { n: 4 })
            .then(activation => assert.deepStrictEqual(activation.response.result, { value: false, n: 1 }))
        })

        it('too many arguments', function () {
          try {
            invoke(composer.dowhile(({ n }) => ({ n: n - 1 }), 'isNotOne', ({ n }) => ({ n: n - 1 })), { n: 4 })
            assert.fail()
          } catch (error) {
            assert.ok(error.message.startsWith('Too many arguments'))
          }
        })
      })

      describe('try', function () {
        it('no error', function () {
          return invoke(composer.try(() => true, error => ({ message: error.error })))
            .then(activation => assert.deepStrictEqual(activation.response.result, { value: true }))
        })

        it('error', function () {
          return invoke(composer.try(() => ({ error: 'foo' }), error => ({ message: error.error })))
            .then(activation => assert.deepStrictEqual(activation.response.result, { message: 'foo' }))
        })

        it('try must throw', function () {
          return invoke(composer.try(composer.task(null), error => ({ message: error.error })), { error: 'foo' })
            .then(activation => assert.deepStrictEqual(activation.response.result, { message: 'foo' }))
        })

        it('while must throw', function () {
          return invoke(composer.try(composer.while(composer.literal(false), null), error => ({ message: error.error })), { error: 'foo' })
            .then(activation => assert.deepStrictEqual(activation.response.result, { message: 'foo' }))
        })

        it('if must throw', function () {
          return invoke(composer.try(composer.if(composer.literal(false), null), error => ({ message: error.error })), { error: 'foo' })
            .then(activation => assert.deepStrictEqual(activation.response.result, { message: 'foo' }))
        })

        it('retain', function () {
          return invoke(composer.retain(composer.try(() => ({ p: 4 }), null)), { n: 3 })
            .then(activation => assert.deepStrictEqual(activation.response.result, { params: { n: 3 }, result: { p: 4 } }))
        })

        it('too many arguments', function () {
          try {
            invoke(composer.try('isNotOne', 'isNotOne', 'isNotOne'))
            assert.fail()
          } catch (error) {
            assert.ok(error.message.startsWith('Too many arguments'))
          }
        })
      })

      describe('finally', function () {
        it('no error', function () {
          return invoke(composer.finally(() => true, params => ({ params })))
            .then(activation => assert.deepStrictEqual(activation.response.result, { params: { value: true } }))
        })

        it('error', function () {
          return invoke(composer.finally(() => ({ error: 'foo' }), params => ({ params })))
            .then(activation => assert.deepStrictEqual(activation.response.result, { params: { error: 'foo' } }))
        })

        it('too many arguments', function () {
          try {
            invoke(composer.finally('isNotOne', 'isNotOne', 'isNotOne'))
            assert.fail()
          } catch (error) {
            assert.ok(error.message.startsWith('Too many arguments'))
          }
        })
      })

      describe('let', function () {
        it('one variable', function () {
          return invoke(composer.let({ x: 42 }, () => x))
            .then(activation => assert.deepStrictEqual(activation.response.result, { value: 42 }))
        })

        it('masking', function () {
          return invoke(composer.let({ x: 42 }, composer.let({ x: 69 }, () => x)))
            .then(activation => assert.deepStrictEqual(activation.response.result, { value: 69 }))
        })

        it('two variables', function () {
          return invoke(composer.let({ x: 42 }, composer.let({ y: 69 }, () => x + y)))
            .then(activation => assert.deepStrictEqual(activation.response.result, { value: 111 }))
        })

        it('two variables combined', function () {
          return invoke(composer.let({ x: 42, y: 69 }, () => x + y))
            .then(activation => assert.deepStrictEqual(activation.response.result, { value: 111 }))
        })

        it('scoping', function () {
          return invoke(composer.let({ x: 42 }, composer.let({ x: 69 }, () => x), ({ value }) => value + x))
            .then(activation => assert.deepStrictEqual(activation.response.result, { value: 111 }))
        })

        it('invalid argument', function () {
          try {
            invoke(composer.let(invoke))
            assert.fail()
          } catch (error) {
            assert.ok(error.message.startsWith('Invalid argument'))
          }
        })
      })

      describe('mask', function () {
        it('let/let/mask', function () {
          return invoke(composer.let({ x: 42 }, composer.let({ x: 69 }, composer.mask(() => x))))
            .then(activation => assert.deepStrictEqual(activation.response.result, { value: 42 }))
        })

        it('let/mask/let', function () {
          return invoke(composer.let({ x: 42 }, composer.mask(composer.let({ x: 69 }, () => x))))
            .then(activation => assert.deepStrictEqual(activation.response.result, { value: 69 }))
        })

        it('let/let/try/mask', function () {
          return invoke(composer.let({ x: 42 }, composer.let({ x: 69 },
            composer.try(composer.mask(() => x), () => { }))))
            .then(activation => assert.deepStrictEqual(activation.response.result, { value: 42 }))
        })

        it('let/let/let/mask', function () {
          return invoke(composer.let({ x: 42 }, composer.let({ x: 69 },
            composer.let({ x: -1 }, composer.mask(() => x)))))
            .then(activation => assert.deepStrictEqual(activation.response.result, { value: 69 }))
        })

        it('let/let/let/mask/mask', function () {
          return invoke(composer.let({ x: 42 }, composer.let({ x: 69 },
            composer.let({ x: -1 }, composer.mask(composer.mask(() => x))))))
            .then(activation => assert.deepStrictEqual(activation.response.result, { value: 42 }))
        })

        it('let/let/mask/let/mask', function () {
          return invoke(composer.let({ x: 42 }, composer.let({ x: 69 },
            composer.mask(composer.let({ x: -1 }, composer.mask(() => x))))))
            .then(activation => assert.deepStrictEqual(activation.response.result, { value: 42 }))
        })
      })

      describe('retain', function () {
        it('base case', function () {
          return invoke(composer.retain('TripleAndIncrement'), { n: 3 })
            .then(activation => assert.deepStrictEqual(activation.response.result, { params: { n: 3 }, result: { n: 10 } }))
        })

        it('throw error', function () {
          return invoke(composer.retain(() => ({ error: 'foo' })), { n: 3 })
            .then(() => assert.fail(), activation => assert.deepStrictEqual(activation.error.response.result, { error: 'foo' }))
        })

        it('catch error', function () {
          return invoke(composer.retain_catch(() => ({ error: 'foo' })), { n: 3 })
            .then(activation => assert.deepStrictEqual(activation.response.result, { params: { n: 3 }, result: { error: 'foo' } }))
        })
      })

      describe('merge', function () {
        it('base case', function () {
          return invoke(composer.merge('TripleAndIncrement'), { n: 3, p: 4 })
            .then(activation => assert.deepStrictEqual(activation.response.result, { n: 10, p: 4 }))
        })
      })

      describe('repeat', function () {
        it('a few iterations', function () {
          return invoke(composer.repeat(3, 'DivideByTwo'), { n: 8 })
            .then(activation => assert.deepStrictEqual(activation.response.result, { n: 1 }))
        })

        it('invalid argument', function () {
          try {
            invoke(composer.repeat('foo'))
            assert.fail()
          } catch (error) {
            assert.ok(error.message.startsWith('Invalid argument'))
          }
        })
      })

      describe('retry', function () {
        it('success', function () {
          return invoke(composer.let({ x: 2 }, composer.retry(2, () => x-- > 0 ? { error: 'foo' } : 42)))
            .then(activation => assert.deepStrictEqual(activation.response.result, { value: 42 }))
        })

        it('failure', function () {
          return invoke(composer.let({ x: 2 }, composer.retry(1, () => x-- > 0 ? { error: 'foo' } : 42)))
            .then(() => assert.fail(), activation => assert.deepStrictEqual(activation.error.response.result.error, 'foo'))
        })

        it('invalid argument', function () {
          try {
            invoke(composer.retry('foo'))
            assert.fail()
          } catch (error) {
            assert.ok(error.message.startsWith('Invalid argument'))
          }
        })
      })
    })
  })

  describe('compositions', function () {
    describe('collatz', function () {
      it('composition must return { n: 1 }', function () {
        return invoke(composer.while('isNotOne', composer.if('isEven', 'DivideByTwo', 'TripleAndIncrement')), { n: 5 })
          .then(activation => assert.deepStrictEqual(activation.response.result, { n: 1 }))
      })
    })
  })
})
