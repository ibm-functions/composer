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
const mock = require('mock-fs')
const path = require('path')
const os = require('os')

const ibmcloudUtils = require('../ibmcloud-utils')
const client = require('../client')

describe('ibmcloud-utils', function () {
  describe('ibmcloud-utils.token-expiration', function () {
    const ibmCloudFunctionsPropsPath =
      process.env.IC_FN_CONFIG_FILE || path.join(os.homedir(), '.bluemix/plugins/cloud-functions/config.json')
    const ibmCloudPropsPath = process.env.IC_CONFIG_FILE || path.join(os.homedir(), '.bluemix/config.json')

    it('read timestamp', function () {
      mock({
        [ibmCloudFunctionsPropsPath]: '{ "IamTimeTokenRefreshed": "2021-03-15T13:24:14+01:00" }'
      })
      const timestamp = ibmcloudUtils.getIamTokenTimestamp()
      assert.strictEqual(timestamp.getTime(), Date.UTC(2021, 2, 15, 12, 24, 14))
    })

    it('token not expired', function () {
      const timeRefreshed = new Date(2021, 2, 13, 13, 24, 14)
      const timeReference = new Date(2021, 2, 13, 13, 30, 0)
      const tokenExpired = ibmcloudUtils.iamTokenExpired(timeRefreshed, timeReference)
      assert.strictEqual(tokenExpired, false)
    })

    it('token expired', function () {
      const timeRefreshed = new Date(2021, 2, 13, 13, 24, 14)
      const timeReference = new Date(2021, 2, 13, 14, 25, 0)
      const tokenExpired = ibmcloudUtils.iamTokenExpired(timeRefreshed, timeReference)
      assert.strictEqual(tokenExpired, true)
    })

    it('client fails when token expired', function () {
      mock({
        [ibmCloudFunctionsPropsPath]: '{ "IamTimeTokenRefreshed": "2021-03-14T12:00:00+01:00", ' +
            '"WskCliNamespaceId": "some-namespace-id", ' +
            '"WskCliNamespaceMode": "IAM" }',
        [ibmCloudPropsPath]: '{ "IAMToken": "some-token" }'
      })

      assert.throws(() => client(), /IAM token expired/)
    })
  })
})
