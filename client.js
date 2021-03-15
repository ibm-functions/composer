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

/* eslint no-eval: 0 */

'use strict'

const conductor = require('./conductor')
const fs = require('fs')
const openwhisk = require('openwhisk')
const ibmcloudUtils = require('./ibmcloud-utils')
const os = require('os')
const path = require('path')

const NS_TYPE_CF = 'CF'
const NS_TYPE_IAM = 'IAM'

// return enhanced openwhisk client capable of deploying compositions
module.exports = function (options, basic, bearer) {
  // try to extract apihost and key first from whisk property file file and then from process.env
  let apihost
  let apiversion
  let apikey
  let ignorecerts
  let namespace = ibmcloudUtils.getNamespaceId()
  let token
  let authHandler

  try {
    const wskpropsPath = process.env.WSK_CONFIG_FILE || path.join(os.homedir(), '.wskprops')
    const lines = fs.readFileSync(wskpropsPath, { encoding: 'utf8' }).split('\n')

    for (let line of lines) {
      let parts = line.trim().split('=')
      if (parts.length === 2) {
        if (parts[0] === 'APIHOST') {
          apihost = parts[1]
        } else if (parts[0] === 'APIVERSION') {
          apiversion = parts[1]
        } else if (parts[0] === 'AUTH') {
          apikey = parts[1]
        } else if (parts[0] === 'APIGW_ACCESS_TOKEN') {
          token = parts[1]
        }
      }
    }
  } catch (error) {}

  if (process.env.__OW_API_HOST) apihost = process.env.__OW_API_HOST
  if (process.env.__OW_API_KEY) apikey = process.env.__OW_API_KEY
  if (process.env.__OW_NAMESPACE) namespace = process.env.__OW_NAMESPACE
  if (process.env.__OW_IGNORE_CERTS) ignorecerts = process.env.__OW_IGNORE_CERTS
  if (process.env.__OW_APIGW_TOKEN) token = process.env.__OW_APIGW_TOKEN

  // check whether there is a CLI argument that overrides the API key retrieved from the config or env
  if (options && options.api_key) apikey = options.api_key

  // retrieve the namespace type
  // we need to apply different authentication strategies for CF and IAM
  const namespaceType = ibmcloudUtils.getNamespaceType()

  //
  // check for IAM-based namespaces, first
  if (namespaceType === NS_TYPE_IAM) {
    // for authentication, we'll use the user IAM access token
    const iamToken = ibmcloudUtils.getIamAuthHeader()

    // define an appropriate authentication handler for IAM
    authHandler = {
      getAuthHeader: () => {
        // use bearer token for IAM authentication
        return Promise.resolve(iamToken)
      }
    }

    // ignore the API key value, in case of an IAM-based namespace
    apikey = undefined

    //
    // in case of CF-based namespaces, the user can opt-in for using bearer token authentication instead of using the default basic authentication
  } else if (namespaceType === NS_TYPE_CF) {
    if (bearer && !basic) {
      // switch from basic auth to bearer token
      authHandler = {
        getAuthHeader: () => {
          return Promise.resolve(`Bearer ${token}`)
        }
      }
    } else if (apikey) {
      // use basic auth
      authHandler = {
        getAuthHeader: () => {
          const apiKeyBase64 = Buffer.from(apikey).toString('base64')
          return Promise.resolve(`Basic ${apiKeyBase64}`)
        }
      }
    }
  }

  const namespaceDisplayName = namespace || '_'

  console.log(`deploying to ${namespaceType}-based namespace '${namespaceDisplayName}' ...`)

  if (!authHandler) {
    throw new Error(
      `Failed to determine the authentication strategy for the ${namespaceType}-based namespace '${namespaceDisplayName}'`
    )
  }

  const wsk = openwhisk(
    Object.assign({ apihost, apiversion, auth_handler: authHandler, namespace, ignore_certs: ignorecerts }, options)
  )
  wsk.compositions = new Compositions(wsk)
  return wsk
}

// management class for compositions
class Compositions {
  constructor (wsk) {
    this.actions = wsk.actions
  }

  deploy (composition, overwrite, debug, kind, timeout, memory, logs, httpOptions) {
    function addHttpOptions (action) {
      // the openwhisk npm allows passthrough request-style options
      return Object.assign({}, action, httpOptions)
    }

    const actions = (composition.actions || [])
      .concat(conductor.generate(composition, debug, kind, timeout, memory, logs))
      .map(addHttpOptions)
    return actions
      .reduce(
        (promise, action) =>
          promise
            .then(() => overwrite && this.actions.delete(action).catch(() => {}))
            .then(() => this.actions.create(action)),
        Promise.resolve()
      )
      .then(() => actions)
  }
}
