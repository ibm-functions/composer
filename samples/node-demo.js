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

// require the composer module
const composer = require('@ibm-functions/composer')

// define the composition
const composition = composer.if(
    composer.action('authenticate', { action: function main({ password }) { return { value: password === 'abc123' } } }),
    composer.action('success', { action: function main() { return { message: 'success' } } }),
    composer.action('failure', { action: function main() { return { message: 'failure' } } }))

// instantiate OpenWhisk client
const wsk = composer.openwhisk({ ignore_certs: true })

wsk.compositions.deploy(composition, 'demo') // deploy composition
    .then(() => wsk.actions.invoke({ name: 'demo', params: { password: 'abc123' }, blocking: true })) // invoke composition
    .then(({ response }) => console.log(JSON.stringify(response.result, null, 4)), console.error)
