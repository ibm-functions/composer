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
const fqn = require('../fqn')

describe('fqn', function () {
  let combos = [
    { n: undefined, s: false, e: 'Name must be a string' },
    { n: null, s: false, e: 'Name must be a string' },
    { n: 0, s: false, e: 'Name must be a string' },
    { n: 42, s: false, e: 'Name must be a string' },
    { n: true, s: false, e: 'Name must be a string' },
    { n: false, s: false, e: 'Name must be a string' },
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
    it(typeof n === 'string' ? `'${n}'` : `${n}`, function () {
      if (s) {
        // good cases
        assert.strictEqual(fqn(n), s)
      } else {
        // error cases
        try {
          fqn(n)
          assert.fail()
        } catch (error) {
          assert.ok(error.message.startsWith(e))
        }
      }
    })
  })
})
