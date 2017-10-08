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

const fs = require('fs')
const path = require('path')
const os = require('os')
const openwhisk = require('openwhisk')
const manager = require('./manager')
let conductor

class Client {
    constructor(options = {}) {
        let apihost = process.env.__OW_API_HOST
        let api_key = process.env.__OW_API_KEY
        let ignore_certs = true
        let redis = process.env.REDIS

        try {
            const wskpropsPath = process.env.WSK_CONFIG_FILE || path.join(os.homedir(), '.wskprops')
            const lines = fs.readFileSync(wskpropsPath).toString('utf8').split('\n')

            for (let line of lines) {
                let parts = line.trim().split('=')
                if (parts.length === 2) {
                    if (parts[0] === 'APIHOST') {
                        apihost = parts[1]
                    } else if (parts[0] === 'AUTH') {
                        api_key = parts[1]
                    } else if (parts[0] === 'REDIS') {
                        redis = parts[1]
                    }
                }
            }
            ignore_certs = apihost.indexOf('bluemix') == -1
        } catch (error) { }

        this.wsk = openwhisk(Object.assign({ apihost, api_key, ignore_certs }, options))

        const action_body = this.wsk.actions.action_body
        this.wsk.actions.action_body = (options) => {
            const body = action_body(options)
            if (options.limits) {
                body.limits = options.limits
            }
            return body
        }

        this.mgr = manager(api_key.substring(0, api_key.indexOf(':')), options.redis || redis)

        const name = 'conductor'
        const action = require('fs').readFileSync(require.resolve('./conductor'), { encoding: 'utf8' })
        const params = { $config: { redis: redis, notify: true } }
        conductor = { name, action, params, limits: { timeout: 300000 } }
    }

    deploy() {
        return this.wsk.actions.update(conductor)
    }
}

module.exports = function () { return new Client(...arguments) }
