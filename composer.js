/*
 * Copyright 2017-2018 IBM Corporation
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

const { minify } = require('uglify-es')

// initialize composer with composer code and conductor code
module.exports = composer(minify(`${composer}`).code, minify(`${conductor}`).code)

function composer(composerCode, conductorCode) {
    const fs = require('fs')
    const os = require('os')
    const path = require('path')
    const util = require('util')

    class ComposerError extends Error {
        constructor(message, argument) {
            super(message + (typeof argument !== 'undefined' ? '\nArgument: ' + util.inspect(argument) : ''))
        }
    }

    /**
     * Encodes a composition as an action by injecting the conductor code
     */
    function encode({ name, action }) {
        if (action.exec.kind !== 'composition') return { name, action }
        const code = `const main=(${conductorCode})(eval,(${composerCode})(),${JSON.stringify(action.exec.composition)})` // invoke conductor on composition
        return { name, action: { exec: { kind: 'nodejs:default', code }, annotations: [{ key: 'conductor', value: action.exec.composition }] } }
    }

    /**
     * Parses a (possibly fully qualified) resource name and validates it. If it's not a fully qualified name,
     * then attempts to qualify it.
     *
     * Examples string to namespace, [package/]action name
     *   foo => /_/foo
     *   pkg/foo => /_/pkg/foo
     *   /ns/foo => /ns/foo
     *   /ns/pkg/foo => /ns/pkg/foo
     */
    function parseActionName(name) {
        if (typeof name !== 'string' || name.trim().length == 0) throw new ComposerError('Name is not specified')
        name = name.trim()
        let delimiter = '/'
        let parts = name.split(delimiter)
        let n = parts.length
        let leadingSlash = name[0] == delimiter
        // no more than /ns/p/a                           
        if (n < 1 || n > 4 || (leadingSlash && n == 2) || (!leadingSlash && n == 4)) throw new ComposerError('Name is not valid')
        // skip leading slash, all parts must be non empty (could tighten this check to match EntityName regex)
        parts.forEach(function (part, i) { if (i > 0 && part.trim().length == 0) throw new ComposerError('Name is not valid') })
        let newName = parts.join(delimiter)
        if (leadingSlash) return newName
        else if (n < 3) return `${delimiter}_${delimiter}${newName}`
        else return `${delimiter}${newName}`
    }

    function compose(composition, actions = []) {
        // collect actions defined in nested composition
        Object.keys(composition).forEach(key => {
            if (composition[key] instanceof Composition) {
                // TODO: check for duplicate entries
                actions.push(...composition[key].actions || [])
                composition[key] = composition[key].composition
            }
        })
        if (Array.isArray(composition.components)) {
            const components = []
            composition.components.forEach(component => {
                // TODO: check for duplicate entries
                actions.push(...component.actions || [])
                components.push(component.composition)
            })
            composition = Object.assign({}, composition, { components })
        }
        return new Composition(composition, actions)
    }

    class Composition {
        constructor(composition, actions = []) {
            this.composition = composition
            if (actions.length > 0) this.actions = actions
        }

        /** Names the composition and returns a composition which invokes the named composition */
        named(name) {
            if (arguments.length > 1) throw new ComposerError('Too many arguments')
            if (typeof name !== 'string') throw new ComposerError('Invalid argument', name)
            name = parseActionName(name)
            if (this.actions && this.actions.findIndex(action => action.name === name) !== -1) throw new ComposerError('Duplicate action name', name)
            const actions = (this.actions || []).concat({ name, action: { exec: { kind: 'composition', composition: this.composition } } })
            return compose({ type: 'action', name }, actions)
        }

        /** Encodes all compositions as actions by injecting the conductor code in them */
        encode(name) {
            if (arguments.length > 1) throw new ComposerError('Too many arguments')
            if (typeof name !== 'undefined' && typeof name !== 'string') throw new ComposerError('Invalid argument', name)
            const obj = typeof name === 'string' ? this.named(name) : this
            return compose(obj.composition, obj.actions.map(encode))
        }
    }

    class Compositions {
        constructor(wsk) {
            this.actions = wsk.actions
        }

        deploy(composition, name) {
            if (arguments.length > 2) throw new ComposerError('Too many arguments')
            if (!(composition instanceof Composition)) throw new ComposerError('Invalid argument', composition)
            const obj = composition.encode(name)
            if (obj.composition.type !== 'action') throw new ComposerError('Cannot deploy anonymous composition')
            return obj.actions.reduce((promise, action) => promise.then(() => this.actions.delete(action).catch(() => { }))
                .then(() => this.actions.update(action)), Promise.resolve())
        }
    }

    class Composer {
        openwhisk(options) {
            // try to extract apihost and key first from whisk property file file and then from process.env
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

            if (process.env.__OW_API_HOST) apihost = process.env.__OW_API_HOST
            if (process.env.__OW_API_KEY) api_key = process.env.__OW_API_KEY

            const wsk = require('openwhisk')(Object.assign({ apihost, api_key }, options))
            wsk.compositions = new Compositions(wsk)
            return wsk
        }

        seq() {
            return this.sequence(...arguments)
        }

        value() {
            return this.literal(...arguments)
        }

        /** Takes a serialized Composition and returns a Composition instance */
        deserialize({ composition, actions }) {
            return new Composition(composition, actions)
        }

        task(obj) {
            if (arguments.length > 1) throw new ComposerError('Too many arguments')
            if (obj === null) return this.seq()
            if (obj instanceof Composition) return obj
            if (typeof obj === 'function') return this.function(obj)
            if (typeof obj === 'string') return this.action(obj)
            throw new ComposerError('Invalid argument', obj)
        }

        sequence(/* ...components */) {
            const args = Array.prototype.slice.call(arguments)
            return compose({ type: 'sequence', components: args.map(obj => this.task(obj)) })
        }

        if(test, consequent, alternate) {
            if (arguments.length > 3) throw new ComposerError('Too many arguments')
            return compose({ type: 'if', test: this.task(test), consequent: this.task(consequent), alternate: this.task(alternate || null) })
        }

        if_nosave(test, consequent, alternate) {
            if (arguments.length > 3) throw new ComposerError('Too many arguments')
            return compose({ type: 'if', test: this.task(test), consequent: this.task(consequent), alternate: this.task(alternate || null), nosave: true })
        }

        while(test, body) {
            if (arguments.length > 2) throw new ComposerError('Too many arguments')
            return compose({ type: 'while', test: this.task(test), body: this.task(body) })
        }

        while_nosave(test, body) {
            if (arguments.length > 2) throw new ComposerError('Too many arguments')
            return compose({ type: 'while', test: this.task(test), body: this.task(body), nosave: true })
        }

        dowhile(body, test) {
            if (arguments.length > 2) throw new ComposerError('Too many arguments')
            return compose({ type: 'dowhile', test: this.task(test), body: this.task(body) })
        }

        dowhile_nosave(body, test) {
            if (arguments.length > 2) throw new ComposerError('Too many arguments')
            return compose({ type: 'dowhile', test: this.task(test), body: this.task(body), nosave: true })
        }

        try(body, handler) {
            if (arguments.length > 2) throw new ComposerError('Too many arguments')
            return compose({ type: 'try', body: this.task(body), handler: this.task(handler) })
        }

        finally(body, finalizer) {
            if (arguments.length > 2) throw new ComposerError('Too many arguments')
            return compose({ type: 'finally', body: this.task(body), finalizer: this.task(finalizer) })
        }

        let(declarations /* , ...components */) {
            if (typeof declarations !== 'object' || declarations === null) throw new ComposerError('Invalid argument', declarations)
            const args = Array.prototype.slice.call(arguments, 1)
            return compose({ type: 'let', declarations, components: args.map(obj => this.task(obj), this) })
        }

        literal(value) {
            if (arguments.length > 1) throw new ComposerError('Too many arguments')
            if (typeof value === 'function') throw new ComposerError('Invalid argument', value)
            return compose({ type: 'literal', value: typeof value === 'undefined' ? {} : value })
        }

        function(fun) {
            if (arguments.length > 1) throw new ComposerError('Too many arguments')
            if (typeof fun === 'function') {
                fun = `${fun}`
                if (fun.indexOf('[native code]') !== -1) throw new ComposerError('Cannot capture native function', fun)
            }
            if (typeof fun === 'string') {
                fun = { kind: 'nodejs:default', code: fun }
            }
            if (typeof fun !== 'object' || fun === null) throw new ComposerError('Invalid argument', fun)
            return compose({ type: 'function', exec: fun })
        }

        action(name, options = {}) {
            if (arguments.length > 2) throw new ComposerError('Too many arguments')
            name = parseActionName(name) // throws ComposerError if name is not valid
            if (typeof options === 'object') options = Object.assign({})
            let exec
            if (options && Array.isArray(options.sequence)) { // native sequence
                const components = options.sequence.map(a => a.indexOf('/') == -1 ? `/_/${a}` : a)
                exec = { kind: 'sequence', components }
                delete options.sequence
            }
            if (options && typeof options.filename === 'string') { // read action code from file
                options.action = fs.readFileSync(options.filename, { encoding: 'utf8' })
                delete options.filename
            }
            if (options && typeof options.action === 'function') {
                options.action = `const main = ${options.action}`
                if (options.action.indexOf('[native code]') !== -1) throw new ComposerError('Cannot capture native function'.action)
            }
            if (options && typeof options.action === 'string') {
                options.action = { kind: 'nodejs:default', code: options.action }
            }
            if (options && typeof options.action === 'object' && options.action !== null) {
                exec = options.action
                delete options.action
            }
            return compose({ type: 'action', name }, exec ? [{ name, action: { exec } }] : [])
        }

        retain(/* ...components */) {
            const args = Array.prototype.slice.call(arguments)
            return compose({ type: 'retain', components: args.map(obj => this.task(obj)) })
        }

        repeat(count /* , ...components */) {
            if (typeof count !== 'number') throw new ComposerError('Invalid argument', count)
            const args = Array.prototype.slice.call(arguments, 1)
            return compose({ type: 'repeat', count, components: args.map(obj => this.task(obj)) })
        }

        retry(count /* , ...components */) {
            if (typeof count !== 'number') throw new ComposerError('Invalid argument', count)
            const args = Array.prototype.slice.call(arguments, 1)
            return compose({ type: 'retry', count, components: args.map(obj => this.task(obj)) })
        }

        mask(/* ...components */) {
            const args = Array.prototype.slice.call(arguments)
            return compose({ type: 'mask', components: args.map(obj => this.task(obj)) })
        }
    }

    return new Composer()
}

// conductor action

function conductor(__eval__, composer, composition) {
    function chain(front, back) {
        front.slice(-1)[0].next = 1
        front.push(...back)
        return front
    }

    function sequence(components, path) {
        if (components.length === 0) return [{ type: 'pass', path }]
        return components.map((json, index) => compile(json, path + '[' + index + ']')).reduce(chain)
    }

    function compile(json, path = '') {
        switch (json.type) {
            case 'sequence':
                return sequence(json.components, path)
            case 'action':
                return [{ type: 'action', name: json.name, path }]
            case 'function':
                return [{ type: 'function', exec: json.exec, path }]
            case 'literal':
                return [{ type: 'literal', value: json.value, path }]
            case 'finally':
                var body = compile(json.body, path + '.body')
                const finalizer = compile(json.finalizer, path + '.finalizer')
                var fsm = [[{ type: 'try', path }], body, [{ type: 'exit', path }], finalizer].reduce(chain)
                fsm[0].catch = fsm.length - finalizer.length
                return fsm
            case 'let':
                var body = sequence(json.components, path)
                return [[{ type: 'let', let: json.declarations, path }], body, [{ type: 'exit', path }]].reduce(chain)
            case 'mask':
                var body = sequence(json.components, path)
                return [[{ type: 'mask', path }], body, [{ type: 'exit', path }]].reduce(chain)
            case 'retain':
                return compile(
                    composer.let(
                        { params: null },
                        args => { params = args },
                        composer.mask(...json.components.map(composition => composer.deserialize({ composition }))),
                        result => ({ params, result })).composition)
            case 'try':
                var body = compile(json.body, path + '.body')
                const handler = chain(compile(json.handler, path + '.handler'), [{ type: 'pass', path }])
                var fsm = [[{ type: 'try', path }], body, [{ type: 'exit', path }]].reduce(chain)
                fsm[0].catch = fsm.length
                fsm.slice(-1)[0].next = handler.length
                fsm.push(...handler)
                return fsm
            case 'if':
                var consequent = compile(json.consequent, path + '.consequent')
                var alternate = chain(compile(json.alternate, path + '.alternate'), [{ type: 'pass', path }])
                if (!json.nosave) consequent = chain([{ type: 'pop', path }], consequent)
                if (!json.nosave) alternate = chain([{ type: 'pop', path }], alternate)
                var fsm = chain(compile(json.test, path + '.test'), [{ type: 'choice', then: 1, else: consequent.length + 1, path }])
                if (!json.nosave) fsm = chain([{ type: 'push', path }], fsm)
                consequent.slice(-1)[0].next = alternate.length
                fsm.push(...consequent)
                fsm.push(...alternate)
                return fsm
            case 'while':
                var consequent = compile(json.body, path + '.body')
                var alternate = [{ type: 'pass', path }]
                if (!json.nosave) consequent = chain([{ type: 'pop', path }], consequent)
                if (!json.nosave) alternate = chain([{ type: 'pop', path }], alternate)
                var fsm = chain(compile(json.test, path + '.test'), [{ type: 'choice', then: 1, else: consequent.length + 1, path }])
                if (!json.nosave) fsm = chain([{ type: 'push', path }], fsm)
                consequent.slice(-1)[0].next = 1 - fsm.length - consequent.length
                fsm.push(...consequent)
                fsm.push(...alternate)
                return fsm
            case 'dowhile':
                var test = compile(json.test, path + '.test')
                if (!json.nosave) test = chain([{ type: 'push', path }], test)
                var fsm = [compile(json.body, path + '.body'), test, [{ type: 'choice', then: 1, else: 2, path }]].reduce(chain)
                if (json.nosave) {
                    fsm.slice(-1)[0].then = 1 - fsm.length
                    fsm.slice(-1)[0].else = 1
                } else {
                    fsm.push({ type: 'pop', path })
                    fsm.slice(-1)[0].next = 1 - fsm.length
                }
                var alternate = [{ type: 'pass', path }]
                if (!json.nosave) alternate = chain([{ type: 'pop', path }], alternate)
                fsm.push(...alternate)
                return fsm
            case 'repeat':
                return compile(
                    composer.let(
                        { count: json.count },
                        composer.while(
                            () => count-- > 0,
                            composer.mask(composer.seq(...json.components.map(composition => composer.deserialize({ composition })))))).composition)
            case 'retry':
                return compile({
                    type: "let",
                    declarations: { count: json.count },
                    components: [{
                        type: 'function',
                        exec: { kind: 'nodejs:default', code: 'params => ({ params })' }
                    }, {
                        type: 'dowhile',
                        test: { type: 'function', exec: { kind: 'nodejs:default', code: "({ result }) => typeof result.error !== 'undefined' && count-- > 0" } },
                        body: {
                            type: 'finally',
                            body: { type: 'function', exec: { kind: 'nodejs:default', code: '({ params }) => params' } },
                            finalizer: {
                                type: 'sequence',
                                components: [{
                                    type: 'retain',
                                    components: [{
                                        type: 'finally',
                                        body: { type: 'sequence', components: json.components },
                                        finalizer: { type: 'function', exec: { kind: 'nodejs:default', code: 'result => ({ result })' } }
                                    }]
                                }, {
                                    type: 'function', exec: { kind: 'nodejs:default', code: '({ params, result }) => ({ params, result: result.result })' }
                                }]
                            }
                        }
                    }, {
                        type: 'function', exec: { kind: 'nodejs:default', code: '({ result }) => result' }
                    }]
                }, path + '.retry')

        }
    }

    const fsm = compile(composition)

    const isObject = obj => typeof obj === 'object' && obj !== null && !Array.isArray(obj)

    // encode error object
    const encodeError = error => ({
        code: typeof error.code === 'number' && error.code || 500,
        error: (typeof error.error === 'string' && error.error) || error.message || (typeof error === 'string' && error) || 'An internal error occurred'
    })

    // error status codes
    const badRequest = error => Promise.reject({ code: 400, error })
    const internalError = error => Promise.reject(encodeError(error))

    return params => Promise.resolve().then(() => invoke(params)).catch(internalError)

    // do invocation
    function invoke(params) {
        // initial state and stack
        let state = 0
        let stack = []

        // restore state and stack when resuming
        if (typeof params.$resume !== 'undefined') {
            if (!isObject(params.$resume)) return badRequest('The type of optional $resume parameter must be object')
            state = params.$resume.state
            stack = params.$resume.stack
            if (typeof state !== 'undefined' && typeof state !== 'number') return badRequest('The type of optional $resume.state parameter must be number')
            if (!Array.isArray(stack)) return badRequest('The type of $resume.stack must be an array')
            delete params.$resume
            inspect() // handle error objects when resuming
        }

        // wrap params if not a dictionary, branch to error handler if error
        function inspect() {
            if (!isObject(params)) params = { value: params }
            if (typeof params.error !== 'undefined') {
                params = { error: params.error } // discard all fields but the error field
                state = undefined // abort unless there is a handler in the stack
                while (stack.length > 0) {
                    if (typeof (state = stack.shift().catch) === 'number') break
                }
            }
        }

        // run function f on current stack
        function run(f) {
            // handle let/mask pairs
            const s = []
            let n = 0
            for (let i in stack) {
                if (typeof stack[i].mask !== 'undefined') {
                    n++
                } else if (typeof stack[i].let !== 'undefined') {
                    if (n === 0) {
                        s.push(stack[i])
                    } else {
                        n--
                    }
                }
            }

            // update value of topmost matching symbol on stack if any
            function set(symbol, value) {
                const element = s.find(element => typeof element.let !== 'undefined' && typeof element.let[symbol] !== 'undefined')
                if (typeof element !== 'undefined') element.let[symbol] = JSON.parse(JSON.stringify(value))
            }

            // collapse stack for invocation
            const env = s.reduceRight((acc, cur) => typeof cur.let === 'object' ? Object.assign(acc, cur.let) : acc, {})
            let main = '(function(){try{'
            for (const name in env) main += `var ${name}=arguments[1]['${name}'];`
            main += `return eval((${f}))(arguments[0])}finally{`
            for (const name in env) main += `arguments[1]['${name}']=${name};`
            main += '}})'
            try {
                return __eval__(main)(params, env)
            } finally {
                for (const name in env) set(name, env[name])
            }
        }

        while (true) {
            // final state, return composition result
            if (typeof state === 'undefined') {
                console.log(`Entering final state`)
                console.log(JSON.stringify(params))
                if (params.error) return params; else return { params }
            }

            // process one state
            const json = fsm[state] // json definition for current state
            console.log(`Entering state ${state} at path fsm${json.path}`)
            const current = state
            state = typeof json.next === 'undefined' ? undefined : current + json.next // default next state
            switch (json.type) {
                case 'choice':
                    state = current + (params.value ? json.then : json.else)
                    break
                case 'try':
                    stack.unshift({ catch: current + json.catch })
                    break
                case 'let':
                    stack.unshift({ let: JSON.parse(JSON.stringify(json.let)) })
                    break
                case 'mask':
                    stack.unshift({ mask: true })
                    break
                case 'exit':
                    if (stack.length === 0) return internalError(`State ${current} attempted to pop from an empty stack`)
                    stack.shift()
                    break
                case 'push':
                    stack.unshift(JSON.parse(JSON.stringify({ params })))
                    break
                case 'pop':
                    if (stack.length === 0) return internalError(`State ${current} attempted to pop from an empty stack`)
                    params = stack.shift().params
                    break
                case 'action':
                    return { action: json.name, params, state: { $resume: { state, stack } } } // invoke continuation
                    break
                case 'literal':
                    params = JSON.parse(JSON.stringify(json.value))
                    inspect()
                    break
                case 'function':
                    let result
                    try {
                        result = run(json.exec.code)
                    } catch (error) {
                        console.error(error)
                        result = { error: `An exception was caught at state ${current} (see log for details)` }
                    }
                    if (typeof result === 'function') result = { error: `State ${current} evaluated to a function` }
                    // if a function has only side effects and no return value, return params
                    params = JSON.parse(JSON.stringify(typeof result === 'undefined' ? params : result))
                    inspect()
                    break
                case 'pass':
                    inspect()
                    break
                default:
                    return internalError(`State ${current} has an unknown type`)
            }
        }
    }
}
