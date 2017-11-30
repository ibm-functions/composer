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
    const isObject = obj => typeof (obj) === 'object' && obj !== null && !Array.isArray(obj)

    // encode error object
    const encodeError = error => ({
        code: typeof error.code === 'number' && error.code || 500,
        error: (typeof error.error === 'string' && error.error) || error.message || (typeof error === 'string' && error) || 'An internal error occurred'
    })

    // error status codes
    const badRequest = error => Promise.reject({ code: 400, error })
    const internalError = error => Promise.reject(encodeError(error))

    // catch all
    return params => Promise.resolve().then(() => invoke(params)).catch(internalError)

    // do invocation
    function invoke(params) {
        // check parameters
        if (!isObject(params.$invoke)) return badRequest('Type of $invoke parameter must be object')
        const fsm = params.$invoke
        delete params.$invoke
        
        if (typeof fsm.Entry !== 'undefined' && typeof fsm.Entry !== 'string') return badRequest('The type of Entry field of the composition must be string')
        if (!isObject(fsm.States)) return badRequest('The composition has no States field of type object')
        if (typeof fsm.Exit !== 'string') return badRequest('The composition has no Exit field of type string')
        if (typeof fsm.Stack !== 'undefined' && !Array.isArray(fsm.Stack)) return badRequest('The Stack field of the composition must be an array')
        
        let state = fsm.Entry
        const stack = fsm.Stack || []

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
        if (fsm.Stack) inspect()

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
                return { $params: params }
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
                    if (typeof json.Action === 'string') {
                        fsm.Entry = state
                        fsm.Stack = stack
                        return { $next: json.Action, $params: params, $invoke: fsm }
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
})()
