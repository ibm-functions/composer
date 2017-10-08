/*
 * Copyright 2017 IBM Corporation
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

const redis = require('redis')

redis.createAsyncClient = function () {
    const client = redis.createClient(...arguments)
    const noop = () => { }
    let handler = noop
    client.on('error', error => handler(error))
    require('redis-commands').list.forEach(f => client[`${f}Async`] = function () {
        let failed = false
        return new Promise((resolve, reject) => {
            handler = error => {
                handler = noop
                failed = true
                reject(error)
            }
            client[f](...arguments, (error, result) => {
                handler = noop
                return error ? reject(error) : resolve(result)
            })
        }).catch(error => {
            if (failed) client.end(true)
            return Promise.reject(error)
        })
    })
    return client
}

module.exports = redis
