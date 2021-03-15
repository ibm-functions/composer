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

const fs = require('fs')
const os = require('os')
const path = require('path')

const getCloudFunctionsConfig = () => {
  try {
    // read the ibm cloud functions cli config file
    const ibmCloudFunctionsPropsPath =
      process.env.IC_FN_CONFIG_FILE || path.join(os.homedir(), '.bluemix/plugins/cloud-functions/config.json')
    const ibmCloudFunctionsConfig = JSON.parse(fs.readFileSync(ibmCloudFunctionsPropsPath, { encoding: 'utf8' }))

    return ibmCloudFunctionsConfig
  } catch (error) {
    console.error('Could not open ibmcloud functions plugin config')
    throw error
  }
}

const getNamespaceType = () => {
  return getCloudFunctionsConfig().WskCliNamespaceMode
}

const getNamespaceId = () => {
  return getCloudFunctionsConfig().WskCliNamespaceId
}

/**
 * return a Apache OpenWhisk Client SDK for JavaScript compliant authentication header token,
 * which can be used within a custom authentication handler
 * see https://github.com/apache/openwhisk-client-js#using-3rd-party-authentication-handler
 * for further details
 */
const getIamAuthHeader = () => {
  // for authentication, we'll use the user IAM access token
  let iamToken
  try {
    // read the IAM Access token from the ibm cloud config file
    const ibmCloudPropsPath = process.env.IC_CONFIG_FILE || path.join(os.homedir(), '.bluemix/config.json')
    const ibmCloudConfig = JSON.parse(fs.readFileSync(ibmCloudPropsPath, { encoding: 'utf8' }))

    iamToken = ibmCloudConfig.IAMToken
  } catch (error) {
    console.error('Could not open ibmcloud config')
    throw error
  }

  // return an object that provides a getAuthHeader function to comply with the authentication handler interface
  // required by OpenWhisk Client SDK for JavaScript
  return iamToken
}

module.exports = {
  getIamAuthHeader,
  getNamespaceType,
  getNamespaceId
}
