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

// Run a composition

'use strict'

// evaluate main exposing the fields of __env__ as variables
function __eval__(__env__, main) {
    main = `(${main})`
    let __eval__ = '__eval__=undefined;params=>{try{'
    for (const name in __env__) {
        __eval__ += `var ${name}=__env__['${name}'];`
    }
    __eval__ += 'return eval(main)(params)}finally{'
    for (const name in __env__) {
        __eval__ += `__env__['${name}']=${name};`
    }
    __eval__ += '}}'
    return eval(__eval__)
}

// keep outer namespace clean
const main = (() => {
    const openwhisk = require('openwhisk')
    const request = require('request-promise')
    const redis = require('redis')

    // inline redis-promise to keep action code in a single file
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

    let wsk // cached openwhisk instance
    let db // cached redis instance

    // encode error object
    const encodeError = error => ({
        code: typeof error.code === 'number' && error.code || 500,
        error: (typeof error.error === 'string' && error.error) || error.message || (typeof error === 'string' && error) || 'An internal error occurred'
    })

    // error status codes
    const ok = () => ({ message: 'OK' })
    const badRequest = error => Promise.reject({ code: 400, error })
    const notFound = error => Promise.reject({ code: 404, error })
    const gone = error => Promise.reject({ code: 410, error })
    const internalError = error => Promise.reject(encodeError(error))

    const isObject = obj => typeof (obj) === 'object' && obj !== null && !Array.isArray(obj)

    // catch all exceptions and rejected promises
    return params => {
        try {
            return invoke(params).catch(internalError)
        } catch (error) {
            return internalError(error)
        }
    }

    function poll(activationId, resolve) { // poll for activation record (1s interval)
        return wsk.activations.get(activationId).then(resolve, () => setTimeout(() => poll(activationId, resolve), 1000))
    }

    // do invocation
    function invoke(params) {
        // check parameters
        if (!isObject(params.$config)) return badRequest('Missing $config parameter of type object')
        if (typeof params.$config.redis !== 'string') return badRequest('Missing $config.redis parameter of type string')
        if (typeof params.$config.notify !== 'undefined' && typeof params.$config.notify !== 'boolean') return badRequest('Type of $config.notify parameter must be Boolean')
        if (typeof params.$config.expiration !== 'undefined' && typeof params.$config.expiration !== 'number') return badRequest('Type of $config.expiration parameter must be number')
        if (typeof params.$activationId !== 'undefined' && typeof params.$activationId !== 'number' && typeof params.$activationId !== 'string') return badRequest('Type of $activationId parameter must be number or string')
        if (typeof params.$sessionId !== 'undefined' && typeof params.$sessionId !== 'number' && typeof params.$sessionId !== 'string') return badRequest('Type of $sessionId parameter must be number or string')
        if (typeof params.$invoke !== 'undefined' && !isObject(params.$invoke)) return badRequest('Type of $invoke parameter must be object')
        if (typeof params.$blocking !== 'undefined' && typeof params.$blocking !== 'boolean') return badRequest('Type of $blocking parameter must be Boolean')
        if (typeof params.$invoke === 'undefined' && typeof params.$sessionId === 'undefined') return badRequest('Missing $invoke or $sessionId parameter')

        // configuration
        const notify = params.$config.notify
        const expiration = params.$config.expiration || (86400 * 7)
        const resuming = typeof params.$sessionId !== 'undefined'
        const blocking = params.__ow_method || params.$blocking
        const session = params.$sessionId || process.env.__OW_ACTIVATION_ID

        // initialize openwhisk instance
        if (!wsk) {
            wsk = openwhisk({ ignore_certs: true })
            if (!notify) wsk.actions.qs_options.invoke = ['blocking', 'notify', 'cause']
        }

        // redis keys
        const apiKey = process.env.__OW_API_KEY.substring(0, process.env.__OW_API_KEY.indexOf(':'))
        const sessionStateKey = `${apiKey}:session:live:${session}`
        const sessionResultKey = `${apiKey}:session:done:${session}`
        const sessionTraceKey = `${apiKey}:list:${session}`
        const sessionsKey = `${apiKey}:all`

        // initialize redis instance
        // TODO: check that redis config has not changed since last invocation
        if (!db) db = redis.createAsyncClient(params.$config.redis)

        // retrieve session state from redis
        function getSessionState() {
            return db.lindexAsync(sessionStateKey, -1).then(result => {
                if (typeof result !== 'string') return notFound(`Cannot find live session ${session}`)
                const obj = JSON.parse(result)
                if (!isObject(obj)) return internalError(`State of live session ${session} is not a JSON object`)
                return obj
            })
        }
        // retrieve session result from redis
        function getSessionResult() {
            return db.brpoplpushAsync(sessionResultKey, sessionResultKey, 30).then(result => {
                if (typeof result !== 'string') return { $session: session } // timeout
                const obj = JSON.parse(result)
                if (!isObject(obj)) throw `Result of session ${session} is not a JSON object`
                return obj
            })
        }

        // resume suspended session
        function resume() {
            params = params.$result
            return db.rpushxAsync(sessionTraceKey, process.env.__OW_ACTIVATION_ID)
                .then(() => getSessionState()) // obtain live session state
                .then(result => {
                    if (!isObject(result.$fsm)) return badRequest(`State of session ${session} is not well formed`)
                    params.$invoke = result.$fsm
                    params.$state = result.$state
                    params.$stack = result.$stack
                    params.$callee = result.$callee
                })
        }

        // start new session
        function start() {
            return db.rpushAsync(sessionTraceKey, process.env.__OW_ACTIVATION_ID)
                .then(() => db.expireAsync(sessionTraceKey, expiration))
                .then(() => db.zaddAsync(sessionsKey, process.env.__OW_DEADLINE * 2, session))
                .then(() => db.lpushAsync(sessionStateKey, JSON.stringify({})))
                .then(() => db.ltrimAsync(sessionStateKey, -1, -1))
                .then(() => db.expireAsync(sessionStateKey, expiration))
        }

        // persist session state to redis
        function persist($fsm, $state, $stack, $callee) {
            // ensure using set-if-exists that the session has not been killed
            return db.lsetAsync(sessionStateKey, -1, JSON.stringify({ $fsm, $state, $stack, $callee }))
                .catch(() => gone(`Session ${session} has been killed`))
        }

        // record session result to redis
        function record(result) {
            return db.lsetAsync(sessionStateKey, -1, JSON.stringify(result))
                .then(() => db.rpoplpushAsync(sessionStateKey, sessionResultKey))
                .then(() => db.delAsync(sessionStateKey))
                .then(() => db.expireAsync(sessionResultKey, expiration))
                .then(() => db.zincrbyAsync(sessionsKey, 1, session))
                .catch(() => gone(`Session ${session} has been killed`))
        }

        // retrieve session state if resuming or initialize session state if not, step, push error in step to db if any
        return (resuming ? resume() : start()).then(() => Promise.resolve().then(step).catch(error => record(encodeError(error)).then(() => Promise.reject(error))))

        // one step of execution 
        function step() {
            const fsm = params.$invoke // the action composition to run
            if (typeof fsm.Entry !== 'string') return badRequest('The composition has no Entry field of type string')
            if (!isObject(fsm.States)) return badRequest('The composition has no States field of type object')
            if (typeof fsm.Exit !== 'string') return badRequest('The composition has no Exit field of type string')

            let state = resuming ? params.$state : (params.$state || fsm.Entry)
            const stack = params.$stack || []
            const callee = params.$callee

            // wrap params if not a JSON object, branch to error handler if error
            function inspect() {
                if (!isObject(params) || Array.isArray(params) || params === null) {
                    params = { value: params }
                }
                if (typeof params.error !== 'undefined') {
                    params = { error: params.error } // discard all fields but the error field
                    state = undefined // abort unless there is a handler in the stack
                    while (stack.length > 0) {
                        if (state = stack.shift().catch) break
                    }
                }
            }

            // handle error objects when resuming
            if (resuming) inspect()

            // delete $ params
            delete params.$config
            delete params.$activationId
            delete params.$invoke
            delete params.$sessionId
            delete params.$state
            delete params.$stack
            delete params.$callee
            delete params.$blocking

            // run function f on current stack
            function run(f) {
                function set(symbol, value) {
                    const element = stack.find(element => typeof element.let !== 'undefined' && typeof element.let[symbol] !== 'undefined')
                    if (typeof element !== 'undefined') element.let[symbol] = JSON.parse(JSON.stringify(value))
                }

                const env = stack.reduceRight((acc, cur) => typeof cur.let === 'object' ? Object.assign(acc, cur.let) : acc, {})
                const result = __eval__(env, f)(params)
                for (const name in env) {
                    set(name, env[name])
                }
                return result
            }

            while (true) {
                // final state
                if (!state) {
                    console.log(`Entering final state`)
                    console.log(JSON.stringify(params))
                    return record(params).then(() => {
                        if (callee) {
                            return wsk.actions.invoke({ name: callee.name, params: { $sessionId: callee.session, $result: params } })
                                .catch(error => badRequest(`Failed to return to callee: ${encodeError(error).error}`))
                        }
                    }).then(() => blocking ? params : ({ $session: session }))
                }

                console.log(`Entering ${state}`)

                if (!isObject(fsm.States[state])) return badRequest(`The composition has no state named ${state}`)
                const json = fsm.States[state] // json for current state
                if (json.Type !== 'Choice' && typeof json.Next !== 'string' && state !== fsm.Exit) return badRequest(`The state named ${state} has no Next field`)
                const current = state // current state
                state = json.Next // default next state

                switch (json.Type) {
                    case 'Choice':
                        if (typeof json.Then !== 'string') return badRequest(`The state named ${current} of type Choice has no Then field`)
                        if (typeof json.Else !== 'string') return badRequest(`The state named ${current} of type Choice has no Else field`)
                        state = params.value === true ? json.Then : json.Else
                        if (stack.length === 0) return badRequest(`The state named ${current} of type Choice attempted to pop from an empty stack`)
                        const top = stack.shift()
                        if (typeof top.params !== 'object') return badRequest(`The state named ${current} of type Choice popped an unexpected stack element`)
                        params = top.params
                        break
                    case 'Try':
                        if (typeof json.Handler !== 'string') return badRequest(`The state named ${current} of type Try has no Handler field`)
                        stack.unshift({ catch: json.Handler }) // register handler
                        break
                    case 'Catch':
                        if (stack.length === 0) return badRequest(`The state named ${current} of type Catch attempted to pop from an empty stack`)
                        if (typeof stack.shift().catch !== 'string') return badRequest(`The state named ${current} of type Catch popped an unexpected stack element`)
                        break
                    case 'Push':
                        stack.unshift({ params: JSON.parse(JSON.stringify(params)) })
                        break
                    case 'Pop':
                        if (stack.length === 0) return badRequest(`The state named ${current} of type Pop attempted to pop from an empty stack`)
                        const tip = stack.shift()
                        if (typeof tip.params !== 'object') return badRequest(`The state named ${current} of type Pop popped an unexpected stack element`)
                        params = { result: params, params: tip.params } // combine current params with persisted params popped from stack
                        break
                    case 'Let':
                        stack.unshift({ let: {} })
                        if (typeof json.Symbol !== 'string') return badRequest(`The state named ${current} of type Let has no Symbol field`)
                        if (typeof json.Value === 'undefined') return badRequest(`The state named ${current} of type Let has no Value field`)
                        stack[0].let[json.Symbol] = JSON.parse(JSON.stringify(json.Value))
                        break
                    case 'End':
                        if (stack.length === 0) return badRequest(`The state named ${current} of type End attempted to pop from an empty stack`)
                        if (typeof stack.shift().let !== 'object') return badRequest(`The state named ${current} of type End popped an unexpected stack element`)
                        break
                    case 'Task':
                        if (typeof json.Action === 'string' && json.Action.substr(json.Action.length - 4) === '.app') { // invoke app
                            params.$callee = { name: process.env.__OW_ACTION_NAME, session }
                            return persist(fsm, state, stack, callee)
                                .then(() => wsk.actions.invoke({ name: json.Action, params })
                                    .catch(error => badRequest(`Failed to invoke app ${json.Action}: ${encodeError(error).error}`)))
                                .then(activation => db.rpushxAsync(sessionTraceKey, activation.activationId))
                                .then(() => blocking ? getSessionResult() : { $session: session })
                        } else if (typeof json.Action === 'string') { // invoke user action
                            const invocation = notify ? { name: json.Action, params, blocking: true } : { name: json.Action, params, notify: process.env.__OW_ACTION_NAME, cause: session }
                            return persist(fsm, state, stack, callee)
                                .then(() => wsk.actions.invoke(invocation)
                                    .catch(error => error.error && error.error.response ? error.error : badRequest(`Failed to invoke action ${json.Action}: ${encodeError(error).error}`))) // catch error reponses
                                .then(activation => db.rpushxAsync(sessionTraceKey, activation.activationId)
                                    .then(() => activation.response || !notify ? activation : new Promise(resolve => poll(activation.activationId, resolve)))) // poll if timeout
                                .then(activation => notify && wsk.actions.invoke({ name: process.env.__OW_ACTION_NAME, params: { $activationId: activation.activationId, $sessionId: session, $result: activation.response.result } }))
                                .then(() => blocking ? getSessionResult() : { $session: session })
                        } else if (typeof json.Value !== 'undefined') { // value
                            params = JSON.parse(JSON.stringify(json.Value))
                            inspect()
                        } else if (typeof json.Function === 'string') { // function
                            let result
                            try {
                                result = run(json.Function)
                            } catch (error) {
                                console.error(error)
                                result = { error: 'An error has occurred: ' + error }
                            }
                            params = typeof result === 'undefined' ? {} : JSON.parse(JSON.stringify(result))
                            inspect()
                        } else {
                            return badRequest(`The kind field of the state named ${current} of type Task is missing`)
                        }
                        break
                    case 'Pass':
                        break
                    default:
                        return badRequest(`The state named ${current} has an unknown type`)
                }
            }
        }
    }
})()
