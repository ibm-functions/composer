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

function check (combinator, n, p, name) {
  if (n === undefined) {
    it('variable argument count', function () {
      for (let i = 0; i < 5; i++) composer[combinator](...Array(i).fill('foo'))
      for (let i = 0; i < 5; i++) composer[combinator](...Array(i).fill(() => { }))
    })
  } else {
    it('argument count', function () {
      for (let i = n; i <= (p || n); i++) composer[combinator](...Array(i).fill('foo'))
    })
    it('too many arguments', function () {
      try {
        composer[combinator](...Array((p || n) + 1).fill('foo'))
        assert.fail()
      } catch (error) {
        assert.ok(error.message.startsWith('Too many arguments'))
      }
    })
    if (n > 0) {
      it('too few arguments', function () {
        try {
          composer[combinator](...Array(n - 1).fill('foo'))
          assert.fail()
        } catch (error) {
          assert.ok(error.message.startsWith('Invalid argument'))
        }
      })
    }
  }
  it('combinator type', function () {
    assert.ok(composer[combinator](...Array(n || 0).fill('foo')).type === name || combinator)
  })
}

describe('composer', function () {
  describe('composer.action', function () {
    it('argument count', function () {
      composer.action('foo')
    })

    it('too many arguments', function () {
      try {
        composer.action('foo', {}, 'foo')
        assert.fail()
      } catch (error) {
        assert.ok(error.message.startsWith('Too many arguments'))
      }
    })

    it('too few arguments', function () {
      try {
        composer.action()
        assert.fail()
      } catch (error) {
        assert.ok(error.message.startsWith('Name must be a string'))
      }
    })

    it('combinator type', function () {
      assert.ok(composer.action('foo').type === 'action')
    })

    it('valid and invalid names', function () {
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

    it('valid and invalid options', function () {
      composer.action('foo', {})
      try {
        composer.action('foo', 42)
        assert.fail()
      } catch (error) {
        assert.ok(error.message.startsWith('Invalid argument'))
      }
    })
  })

  describe('composer.function', function () {
    check('function', 1)

    it('function', function () {
      composer.function(() => { })
    })

    it('string', function () {
      composer.function('() => {}')
    })

    it('number (invalid)', function () {
      try {
        composer.function(42)
        assert.fail()
      } catch (error) {
        assert.ok(error.message.startsWith('Invalid argument'))
      }
    })
  })

  describe('composer.literal', function () {
    check('literal', 1)

    it('boolean', function () {
      composer.literal(true)
    })

    it('number', function () {
      composer.literal(42)
    })

    it('string', function () {
      composer.literal('foo')
    })

    it('dictionary', function () {
      composer.literal({ foo: 42 })
    })

    it('function (invalid)', function () {
      try {
        composer.literal(() => { })
        assert.fail()
      } catch (error) {
        assert.ok(error.message.startsWith('Invalid argument'))
      }
    })
  })

  describe('composer.value', function () {
    check('value', 1)

    it('boolean', function () {
      composer.value(true)
    })

    it('number', function () {
      composer.value(42)
    })

    it('string', function () {
      composer.value('foo')
    })

    it('dictionary', function () {
      composer.value({ foo: 42 })
    })

    it('function (invalid)', function () {
      try {
        composer.value(() => { })
        assert.fail()
      } catch (error) {
        assert.ok(error.message.startsWith('Invalid argument'))
      }
    })
  })

  describe('composer.parse', function () {
    it('argument count', function () {
      composer.parse({ 'type': 'sequence', 'components': [] })
    })

    it('too many arguments', function () {
      try {
        composer.parse({ 'type': 'sequence', 'components': [] }, 'foo')
        assert.fail()
      } catch (error) {
        assert.ok(error.message.startsWith('Too many arguments'))
      }
    })

    it('too few arguments', function () {
      try {
        composer.parse()
        assert.fail()
      } catch (error) {
        assert.ok(error.message.startsWith('Invalid argument'))
      }
    })

    it('combinator type', function () {
      assert.ok(composer.parse({
        'type': 'sequence',
        'components': [{
          'type': 'action',
          'name': 'echo'
        }, {
          'type': 'action',
          'name': 'echo'
        }]
      }).type === 'sequence')
    })
  })

  describe('composer.task', function () {
    check('task', 1, 1, 'action')

    it('string', function () {
      composer.task('isNotOne')
    })

    it('function', function () {
      composer.task(() => { })
    })

    it('null', function () {
      composer.task(null)
    })

    it('boolean (invalid)', function () {
      try {
        composer.task(false)
        assert.fail()
      } catch (error) {
        assert.ok(error.message.startsWith('Invalid argument'))
      }
    })

    it('number (invalid)', function () {
      try {
        composer.task(42)
        assert.fail()
      } catch (error) {
        assert.ok(error.message.startsWith('Invalid argument'))
      }
    })

    it('dictionary (invalid)', function () {
      try {
        composer.task({ foo: 42 })
        assert.fail()
      } catch (error) {
        assert.ok(error.message.startsWith('Invalid argument'))
      }
    })
  })

  describe('composer.let', function () {
    it('variable argument count', function () {
      composer.let({})
      composer.let({}, 'foo')
      composer.let({}, 'foo', 'foo')
    })

    it('too few arguments', function () {
      try {
        composer.let()
        assert.fail()
      } catch (error) {
        assert.ok(error.message.startsWith('Invalid argument'))
      }
    })

    it('combinator type', function () {
      assert.ok(composer.let({}).type === 'let')
    })
  })

  describe('composer.repeat', function () {
    it('variable argument count', function () {
      composer.repeat(42)
      composer.repeat(42, 'foo')
      composer.repeat(42, 'foo', 'foo')
    })

    it('too few arguments', function () {
      try {
        composer.repeat()
        assert.fail()
      } catch (error) {
        assert.ok(error.message.startsWith('Invalid argument'))
      }
    })

    it('combinator type', function () {
      assert.ok(composer.repeat(42).type === 'repeat')
    })
  })

  describe('composer.retry', function () {
    it('variable argument count', function () {
      composer.retry(42)
      composer.retry(42, 'foo')
      composer.retry(42, 'foo', 'foo')
    })

    it('too few arguments', function () {
      try {
        composer.retry()
        assert.fail()
      } catch (error) {
        assert.ok(error.message.startsWith('Invalid argument'))
      }
    })

    it('combinator type', function () {
      assert.ok(composer.retry(42).type === 'retry')
    })
  })

  describe('composer.if', function () {
    check('if', 2, 3)
  })

  describe('composer.if_nosave', function () {
    check('if_nosave', 2, 3)
  })

  describe('composer.while', function () {
    check('while', 2)
  })

  describe('composer.while_nosave', function () {
    check('while_nosave', 2)
  })

  describe('composer.dowhile', function () {
    check('dowhile', 2)
  })

  describe('composer.dowhile_nosave', function () {
    check('dowhile_nosave', 2)
  })

  describe('composer.try', function () {
    check('try', 2)
  })

  describe('composer.finally', function () {
    check('finally', 2)
  })

  describe('composer.empty', function () {
    check('empty', 0)
  })

  describe('composer.mask', function () {
    check('mask')
  })

  describe('composer.async', function () {
    check('async')
  })

  describe('composer.retain', function () {
    check('retain')
  })

  describe('composer.retain_catch', function () {
    check('retain_catch')
  })

  describe('composer.sequence', function () {
    check('sequence')
  })

  describe('composer.seq', function () {
    check('seq')
  })

  describe('composer.merge', function () {
    check('merge')
  })

  describe('composer.parallel', function () {
    check('parallel')
  })

  describe('composer.par', function () {
    check('par')
  })

  describe('composer.map', function () {
    check('map')
  })

  describe('composer.dynamic', function () {
    check('dynamic', 0)
  })
})
