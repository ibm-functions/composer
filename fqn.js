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

/**
 * Parses a (possibly fully qualified) entity name and validates it.
 * If it's not a fully qualified name, then attempts to qualify it.
 *
 * Examples:
 *   foo => /_/foo
 *   pkg/foo => /_/pkg/foo
 *   /ns/foo => /ns/foo
 *   /ns/pkg/foo => /ns/pkg/foo
 */
module.exports = function (name) {
  if (typeof name !== 'string') throw new Error('Name must be a string')
  if (name.trim().length === 0) throw new Error('Name is not valid')
  name = name.trim()
  const delimiter = '/'
  const parts = name.split(delimiter)
  const n = parts.length
  const leadingSlash = name[0] === delimiter
  // no more than /ns/p/a
  if (n < 1 || n > 4 || (leadingSlash && n === 2) || (!leadingSlash && n === 4)) throw new Error('Name is not valid')
  // skip leading slash, all parts must be non empty (could tighten this check to match EntityName regex)
  parts.forEach(function (part, i) { if (i > 0 && part.trim().length === 0) throw new Error('Name is not valid') })
  const newName = parts.join(delimiter)
  if (leadingSlash) return newName
  else if (n < 3) return `${delimiter}_${delimiter}${newName}`
  else return `${delimiter}${newName}`
}
