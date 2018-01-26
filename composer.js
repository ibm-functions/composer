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

// composer module

const fs = require('fs')
const os = require('os')
const path = require('path')
const util = require('util')

const clone = require('clone')
const openwhisk = require('openwhisk')

class ComposerError extends Error {
    constructor(message, cause) {
        super(message)
        const index = this.stack.indexOf('\n')
        this.stack = this.stack.substring(0, index) + '\nCause: ' + util.inspect(cause) + this.stack.substring(index)
    }
}

function chain(front, back) {
    front.States.push(...back.States)
    front.Exit.Next = back.Entry
    front.Exit = back.Exit
    front.Manifest.push(...back.Manifest)
    return front
}

function push(id) {
    const Entry = { Type: 'Push', id }
    return { Entry, States: [Entry], Exit: Entry, Manifest: [] }
}

function pop(id) {
    const Entry = { Type: 'Pop', id }
    return { Entry, States: [Entry], Exit: Entry, Manifest: [] }
}

function begin(id, symbol, value) {
    const Entry = { Type: 'Let', Symbol: symbol, Value: value, id }
    return { Entry, States: [Entry], Exit: Entry, Manifest: [] }
}

function end(id) {
    const Entry = { Type: 'End', id }
    return { Entry, States: [Entry], Exit: Entry, Manifest: [] }
}

const isObject = obj => typeof obj === 'object' && obj !== null && !Array.isArray(obj)

class Composer {
    constructor(options = {}) {
        // try to extract apihost and key from wskprops
        let apihost
        let api_key

        try {
            const wskpropsPath = process.env.WSK_CONFIG_FILE || path.join(os.homedir(), '.wskprops')
            const lines = fs.readFileSync(wskpropsPath, { encoding: 'utf8' }).split('\n')

            for (let line of lines) {
                let parts = line.trim().split('=')
                if (parts.length === 2) {
                    if (parts[0] === 'APIHOST') {
                        apihost = parts[1]
                    } else if (parts[0] === 'AUTH') {
                        api_key = parts[1]
                    }
                }
            }
        } catch (error) { }

        this.wsk = openwhisk(Object.assign({ apihost, api_key }, options))
        this.merge = (result, params) => Object.assign(params, result)
    }

    task(obj, options) {
        if (options && options.pre) return this.preprocess(obj, options)
        if (options && options.post) return this.postprocess(obj, options)
        let Entry
        let Manifest = []
        if (obj == null) {
            // case null: identity function (must throw errors if any)
            return this.task(params => params, { Helper: 'null' })
        } else if (Array.isArray(obj) && obj.length > 0 && typeof obj.slice(-1)[0].name === 'string') {
            // case array: last action in the array
            Manifest = clone(obj)
            Entry = { Type: 'Task', Action: obj.slice(-1)[0].name }
        } else if (typeof obj === 'object' && typeof obj.Entry === 'object' && Array.isArray(obj.States) && typeof obj.Exit === 'object' && Array.isArray(obj.Manifest)) {
            // case object: composition
            return clone(obj)
        } else if (typeof obj === 'function') {
            // case function: inline function
            Entry = { Type: 'Task', Function: obj.toString() }
        } else if (typeof obj === 'string') {
            // case string: action
            if (options && options.filename) Manifest = [{ name: obj, action: fs.readFileSync(options.filename, { encoding: 'utf8' }) }]
            if (options && typeof options.action === 'string') Manifest = [{ name: obj, action: options.action }]
            if (options && typeof options.action === 'function') Manifest = [{ name: obj, action: options.action.toString() }]
            Entry = { Type: 'Task', Action: obj }
        } else {
            // error
            throw new ComposerError('Invalid composition argument', obj)
        }
        if (options && options.Helper) Entry.Helper = options.Helper
        return { Entry, States: [Entry], Exit: Entry, Manifest }
    }


    preprocess(obj, options) {
        const pre = options.pre.toString()
        return this.sequence(this.retain(this.value({ pre })), ({ params, result }) => {
            const dict = eval(result.pre)(params)
            return typeof dict === 'undefined' ? params : dict
        }, this.task(obj, Object.assign({}, options, { pre: undefined })))
    }

    postprocess(obj, options) {
        const post = options.post.toString()
        if (options.post.length === 1) {
            return this.sequence(this.task(obj, Object.assign({}, options, { post: undefined })), this.retain(this.value({ post })), ({ params, result }) => {
                const dict = eval(result.post)(params)
                return typeof dict === 'undefined' ? params : dict
            })
        } else {
            // save params
            return this.sequence(this.retain(this.task(obj, Object.assign({}, options, { post: undefined }))), this.retain(this.value({ post })), ({ params, result }) => {
                const dict = eval(result.post)(params.result, params.params)
                return typeof dict === 'undefined' ? params.result : dict
            })
        }
    }

    sequence() {
        if (arguments.length == 0) return this.task()
        return Array.prototype.map.call(arguments, x => this.task(x), this).reduce(chain)
    }

    seq() {
        return this.sequence(...arguments)
    }

    if(test, consequent, alternate) {
        if (test == null || consequent == null) throw new ComposerError('Missing arguments in composition', arguments)
        const id = {}
        test = chain(push(id), this.task(test))
        consequent = this.task(consequent)
        alternate = this.task(alternate)
        const Exit = { Type: 'Pass', id }
        const choice = { Type: 'Choice', Then: consequent.Entry, Else: alternate.Entry, id }
        test.States.push(choice)
        test.States.push(...consequent.States)
        test.States.push(...alternate.States)
        test.Exit.Next = choice
        consequent.Exit.Next = Exit
        alternate.Exit.Next = Exit
        test.States.push(Exit)
        test.Exit = Exit
        test.Manifest.push(...consequent.Manifest)
        test.Manifest.push(...alternate.Manifest)
        return test
    }

    while(test, body) {
        if (test == null || body == null) throw new ComposerError('Missing arguments in composition', arguments)
        const id = {}
        test = chain(push(id), this.task(test))
        body = this.task(body)
        const Exit = { Type: 'Pass', id }
        const choice = { Type: 'Choice', Then: body.Entry, Else: Exit, id }
        test.States.push(choice)
        test.States.push(...body.States)
        test.Exit.Next = choice
        body.Exit.Next = test.Entry
        test.States.push(Exit)
        test.Exit = Exit
        test.Manifest.push(...body.Manifest)
        return test
    }

    try(body, handler) {
        if (body == null || handler == null) throw new ComposerError('Missing arguments in composition', arguments)
        const id = {}
        body = this.task(body)
        handler = this.task(handler)
        const Exit = { Type: 'Pass', id }
        const Entry = { Type: 'Try', Next: body.Entry, Handler: handler.Entry, id }
        const pop = { Type: 'Catch', Next: Exit, id }
        const States = [Entry]
        States.push(...body.States, pop, ...handler.States, Exit)
        body.Exit.Next = pop
        handler.Exit.Next = Exit
        body.Manifest.push(...handler.Manifest)
        return { Entry, States, Exit, Manifest: body.Manifest }
    }

    retain(body, flag = false) {
        if (body == null) throw new ComposerError('Missing arguments in composition', arguments)
        if (typeof flag !== 'boolean') throw new ComposerError('Invalid retain flag', flag)

        const id = {}
        if (!flag) return chain(push(id), chain(this.task(body), pop(id)))

        return this.sequence(
            this.retain(
                this.try(
                    this.sequence(
                        body,
                        this.task(params => ({ params }), { Helper: 'retain_1' })
                    ),
                    this.task(params => ({ params }), { Helper: 'retain_3' })
                )
            ),
            this.task(params => ({ params: params.params, result: params.result.params }), { Helper: 'retain_2' })
        )
    }

    assign(dest, body, source, flag = false) {
        if (dest == null || body == null) throw new ComposerError('Missing arguments in composition', arguments)
        if (typeof flag !== 'boolean') throw new ComposerError('Invalid assign flag', flag)

        const t = source ? this.let('source', source, this.retain(this.sequence(this.task(params => params[source], { Helper: 'assign_1' }), body), flag)) : this.retain(body, flag)
        return this.let('dest', dest, t, this.task(params => { params.params[dest] = params.result; return params.params }, { Helper: 'assign_2' }))
    }

    let(arg1, arg2) {
        if (arg1 == null) throw new ComposerError('Missing arguments in composition', arguments)
        if (typeof arg1 === 'string') {
            const id = {}
            return chain(begin(id, arg1, arg2), chain(this.sequence(...Array.prototype.slice.call(arguments, 2)), end(id)))
        } else if (isObject(arg1)) {
            const enter = []
            const exit = []
            for (const name in arg1) {
                const id = {}
                enter.push(begin(id, name, arg1[name]))
                exit.unshift(end(id))
            }
            if (enter.length == 0) return this.sequence(...Array.prototype.slice.call(arguments, 1))
            return chain(enter.reduce(chain), chain(this.sequence(...Array.prototype.slice.call(arguments, 1)), exit.reduce(chain)))
        } else {
            throw new ComposerError('Invalid first let argument', arg1)
        }
    }

    retry(count, body) {
        if (body == null) throw new ComposerError('Missing arguments in composition', arguments)
        if (typeof count !== 'number') throw new ComposerError('Invalid retry count', count)

        return this.let('count', count,
            this.retain(body, true),
            this.while(
                this.task(params => typeof params.result.error !== 'undefined' && count-- > 0, { Helper: 'retry_1' }),
                this.sequence(this.task(params => params.params, { Helper: 'retry_2' }), this.retain(body, true))),
            this.task(params => params.result, { Helper: 'retry_3' }))
    }

    repeat(count, body) {
        if (body == null) throw new ComposerError('Missing arguments in composition', arguments)
        if (typeof count !== 'number') throw new ComposerError('Invalid repeat count', count)

        return this.let('count', count, this.while(this.task(() => count-- > 0, { Helper: 'repeat_1' }), body))
    }

    value(json) {
        const Entry = { Type: 'Task', Value: typeof json === 'undefined' ? {} : json }
        return { Entry, States: [Entry], Exit: Entry, Manifest: [] }
    }

    compile(name, obj, filename) {
        if (typeof name !== 'string') throw new ComposerError('Invalid name argument for compile', name)
        if (typeof filename !== 'undefined' && typeof filename !== 'string') throw new ComposerError('Invalid optional filename argument for compile', filename)
        if (typeof obj === 'undefied') new ComposerError('Missing arguments in composition', arguments)
        obj = this.task(obj)
        const States = {}
        let Entry
        let Exit
        let count = 0
        obj.States.forEach(state => {
            if (typeof state.id === 'undefined') state.id = {}
            if (typeof state.id.id === 'undefined') state.id.id = count++
            const id = (state.Type === 'Task' ? state.Action && 'action' || state.Function && 'function' || state.Value && 'value' : state.Type.toLowerCase()) + '_' + state.id.id
            States[id] = state
            state.id = id
            if (state === obj.Entry) Entry = id
            if (state === obj.Exit) Exit = id
        })
        obj.States.forEach(state => {
            if (state.Next) state.Next = state.Next.id
            if (state.Then) state.Then = state.Then.id
            if (state.Else) state.Else = state.Else.id
            if (state.Handler) state.Handler = state.Handler.id
        })
        obj.States.forEach(state => {
            delete state.id
        })
        const action = `${main}\nconst __composition__ =  ${JSON.stringify({ Entry, States, Exit }, null, 4)}\n`
        if (filename) fs.writeFileSync(filename, action, { encoding: 'utf8' })
        obj.Manifest.push({ name, action, annotations: { conductor: { Entry, States, Exit } } })
        return obj.Manifest
    }

    deploy(obj) {
        if (!Array.isArray(obj) || obj.length === 0) throw new ComposerError('Invalid argument for deploy', obj)

        // return the count of successfully deployed actions
        return clone(obj).reduce(
            (promise, action) => promise.then(i => this.wsk.actions.update(action).then(_ => i + 1, err => { console.error(err); return i })), Promise.resolve(0)
        ).then(i => `${i}/${obj.length}`)
    }
}

module.exports = new Composer()

// conductor action

function main(params) {
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
    return (() => {
        const isObject = obj => typeof obj === 'object' && obj !== null && !Array.isArray(obj)

        // encode error object
        const encodeError = error => ({
            code: typeof error.code === 'number' && error.code || 500,
            error: (typeof error.error === 'string' && error.error) || error.message || (typeof error === 'string' && error) || 'An internal error occurred'
        })

        // error status codes
        const badRequest = error => Promise.reject({ code: 400, error })
        const internalError = error => Promise.reject(encodeError(error))

        // catch all
        return Promise.resolve().then(() => invoke(params)).catch(internalError)

        // do invocation
        function invoke(params) {
            const fsm = __composition__

            if (typeof fsm.Entry !== 'undefined' && typeof fsm.Entry !== 'string') return badRequest('The type of Entry field of the composition must be string')
            if (!isObject(fsm.States)) return badRequest('The composition has no States field of type object')
            if (typeof fsm.Exit !== 'string') return badRequest('The composition has no Exit field of type string')

            let state = fsm.Entry
            let stack = []

            // check parameters
            if (typeof params.$resume !== 'undefined') {
                if (!isObject(params.$resume)) return badRequest('Type of optional $resume parameter must be object')
                state = params.$resume.state
                if (typeof state !== 'undefined' && typeof state !== 'string') return badRequest('Type of optional $resume.state parameter must be string')
                stack = params.$resume.stack
                if (typeof state !== 'undefined' && typeof state !== 'string') return badRequest('Type of optional $resume.state parameter must be string')
                if (!Array.isArray(stack)) return badRequest('The type of $resume.stack must be an array')
                delete params.$resume
                inspect() // handle error objects when resuming
            }

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
                    if (params.error) return params; else return { params }
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
                            return { action: json.Action, params, state: { $resume: { state, stack } } }
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
}
