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

const redis = require('./redis-promise')

let apikey
let args
let expiration
const addLivePrefix = session => `${apikey}:session:live:${session}`
const addDonePrefix = session => `${apikey}:session:done:${session}`
const addListPrefix = session => `${apikey}:list:${session}`
const sessionsKey = () => `${apikey}:all`

const isObject = obj => typeof obj === 'object' && obj !== null && !Array.isArray(obj)

class Client {
    constructor(config) {
        apikey = config.key || config
        expiration = config.expiration || 86400 * 7
        args = Array.prototype.slice.call(arguments, 1)
        this.client = redis.createAsyncClient(...args)
    }

    register(session) {
        return this.client.lpushAsync(addLivePrefix(session), JSON.stringify({}))
            .then(() => this.client.ltrimAsync(addLivePrefix(session), -1, -1))
            .then(() => this.client.expireAsync(addLivePrefix(session), expiration))
            .then(() => this.client.existsAsync(addDonePrefix(session)))
            .then(n => n && this.client.delAsync(addLivePrefix(session)))
    }

    // timeout in seconds, set block to true to block even if session does not exists
    get(session, timeout, block) {
        return this.client.lindexAsync(addDonePrefix(session), 0).then(result => {
            if (typeof result === 'string' || typeof timeout === 'undefined') return result // got a result or not willing to wait
            return this.client.existsAsync(addLivePrefix(session), addDonePrefix(session)).then(n => {
                if (!block && n === 0) throw `Cannot find session ${session}` // not willing to wait for session to appear
            }).then(() => {
                let other = redis.createAsyncClient(...args) // use separate client for blocking read
                return other.brpoplpushAsync(addDonePrefix(session), addDonePrefix(session), timeout).then(result => other.quitAsync().then(() => result))
            })
        }).then(result => { // parse result
            if (typeof result !== 'string') throw `Cannot find result of session ${session}`
            const obj = JSON.parse(result)
            if (!isObject(obj)) throw `Result of session ${session} is not a JSON object`
            return obj
        })
    }

    kill(session) {
        return this.client.delAsync(addLivePrefix(session)).then(count => {
            if (count === 1) return this.client.delAsync(addListPrefix(session)).then(() => this.client.zremAsync(sessionsKey(), session)).then(() => `OK`)
            throw `Cannot find live session ${session}`
        })
    }

    purge(session) {
        return this.client.delAsync(addLivePrefix(session), addDonePrefix(session), addListPrefix(session)).then(count => {
            if (count !== 0) return this.client.zremAsync(sessionsKey(), session).then(() => `OK`)
            throw `Cannot find session ${session}`
        })
    }

    trace(session) {
        return this.client.lrangeAsync(addListPrefix(session), 0, -1).then(trace => {
            if (trace.length > 0) return { trace }
            throw `Cannot find trace for session ${session}`
        })
    }

    flush() {
        return this.client.keysAsync(`${apikey}:*`).then(keys => keys.length > 0 ? this.client.delAsync(keys) : 0)
    }

    last({ limit = 30, skip = 0 } = {}) {
        limit = Math.max(1, Math.min(200, limit)) // default limit is 30, max limit is 200
        return this.client.zrevrangeAsync(sessionsKey(), 0, 0, 'WITHSCORES').then(result =>
            result.length ? this.client.zremrangebyscoreAsync(sessionsKey(), '-inf', parseInt(result[1]) - expiration * 2000)
                .then(() => skip === 0 && limit === 1 ? result : this.client.zrevrangebyscoreAsync(sessionsKey(), 'inf', '-inf', 'WITHSCORES', 'LIMIT', skip, limit))
                .then(result => result.reduce(function (dst, session, index, src) {
                    if (index % 2 === 0) {
                        const time = parseInt(src[index + 1])
                        dst.push({ session, time: (time - time % 2) / 2, live: !(time & 1) })
                    }
                    return dst
                }, [])) : [])
    }

    list(options) {
        return this.last(options).then(list => {
            const live = []
            const done = []
            list.forEach(entry => (entry.live ? live : done).push(entry.session))
            return { live: live, done, next: 0 }
        })
    }

    quit() {
        return this.client.quitAsync()
    }
}

module.exports = function () { return new Client(...arguments) }
