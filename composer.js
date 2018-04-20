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

// compiler code shared between composer and conductor (to permit client-side and server-side lowering)

function compiler() {
    const util = require('util')
    const semver = require('semver')

    // standard combinators
    const combinators = {
        empty: { since: '0.4.0' },
        seq: { components: true, since: '0.4.0' },
        sequence: { components: true, since: '0.4.0' },
        if: { args: [{ _: 'test' }, { _: 'consequent' }, { _: 'alternate', optional: true }], since: '0.4.0' },
        if_nosave: { args: [{ _: 'test' }, { _: 'consequent' }, { _: 'alternate', optional: true }], since: '0.4.0' },
        while: { args: [{ _: 'test' }, { _: 'body' }], since: '0.4.0' },
        while_nosave: { args: [{ _: 'test' }, { _: 'body' }], since: '0.4.0' },
        dowhile: { args: [{ _: 'body' }, { _: 'test' }], since: '0.4.0' },
        dowhile_nosave: { args: [{ _: 'body' }, { _: 'test' }], since: '0.4.0' },
        try: { args: [{ _: 'body' }, { _: 'handler' }], since: '0.4.0' },
        finally: { args: [{ _: 'body' }, { _: 'finalizer' }], since: '0.4.0' },
        retain: { components: true, since: '0.4.0' },
        retain_catch: { components: true, since: '0.4.0' },
        let: { args: [{ _: 'declarations', type: 'object' }], components: true, since: '0.4.0' },
        mask: { components: true, since: '0.4.0' },
        action: { args: [{ _: 'name', type: 'string' }, { _: 'action', type: 'object', optional: true }], since: '0.4.0' },
        composition: { args: [{ _: 'name', type: 'string' }, { _: 'composition' }], since: '0.4.0' },
        repeat: { args: [{ _: 'count', type: 'number' }], components: true, since: '0.4.0' },
        retry: { args: [{ _: 'count', type: 'number' }], components: true, since: '0.4.0' },
        value: { args: [{ _: 'value', type: 'value' }], since: '0.4.0' },
        literal: { args: [{ _: 'value', type: 'value' }], since: '0.4.0' },
        function: { args: [{ _: 'function', type: 'object' }], since: '0.4.0' }
    }

    // composer error class
    class ComposerError extends Error {
        constructor(message, argument) {
            super(message + (argument !== undefined ? '\nArgument: ' + util.inspect(argument) : ''))
        }
    }

    // composition class
    class Composition {
        // weaker instanceof to tolerate multiple instances of this class
        static [Symbol.hasInstance](instance) {
            return instance.constructor && instance.constructor.name === Composition.name
        }

        // construct a composition object with the specified fields
        constructor(composition) {
            return Object.assign(this, composition)
        }

        // apply f to all fields of type composition
        visit(f) {
            const combinator = combinators[this.type]
            if (combinator.components) {
                this.components = this.components.map(f)
            }
            for (let arg of combinator.args || []) {
                if (arg.type === undefined) {
                    this[arg._] = f(this[arg._], arg._)
                }
            }
        }
    }

    // compiler class
    class Compiler {
        // detect task type and create corresponding composition object
        task(task) {
            if (arguments.length > 1) throw new ComposerError('Too many arguments')
            if (task === null) return this.empty()
            if (task instanceof Composition) return task
            if (typeof task === 'function') return this.function(task)
            if (typeof task === 'string') return this.action(task)
            throw new ComposerError('Invalid argument', task)
        }

        // function combinator: stringify function code
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
            return new Composition({ type: 'function', function: { exec: fun } })
        }

        // lowering

        _empty() {
            return this.sequence()
        }

        _seq(composition) {
            return this.sequence(...composition.components)
        }

        _value(composition) {
            return this._literal(composition)
        }

        _literal(composition) {
            return this.let({ value: composition.value }, () => value)
        }

        _retain(composition) {
            return this.let(
                { params: null },
                args => { params = args },
                this.mask(...composition.components),
                result => ({ params, result }))
        }

        _retain_catch(composition) {
            return this.seq(
                this.retain(
                    this.finally(
                        this.seq(...composition.components),
                        result => ({ result }))),
                ({ params, result }) => ({ params, result: result.result }))
        }

        _if(composition) {
            return this.let(
                { params: null },
                args => { params = args },
                this.if_nosave(
                    this.mask(composition.test),
                    this.seq(() => params, this.mask(composition.consequent)),
                    this.seq(() => params, this.mask(composition.alternate))))
        }

        _while(composition) {
            return this.let(
                { params: null },
                args => { params = args },
                this.while_nosave(
                    this.mask(composition.test),
                    this.seq(() => params, this.mask(composition.body), args => { params = args })),
                () => params)
        }

        _dowhile(composition) {
            return this.let(
                { params: null },
                args => { params = args },
                this.dowhile_nosave(
                    this.seq(() => params, this.mask(composition.body), args => { params = args }),
                    this.mask(composition.test)),
                () => params)
        }

        _repeat(composition) {
            return this.let(
                { count: composition.count },
                this.while(
                    () => count-- > 0,
                    this.mask(this.seq(...composition.components))))
        }

        _retry(composition) {
            return this.let(
                { count: composition.count },
                params => ({ params }),
                this.dowhile(
                    this.finally(({ params }) => params, this.mask(this.retain_catch(...composition.components))),
                    ({ result }) => result.error !== undefined && count-- > 0),
                ({ result }) => result)
        }

        // define combinator methods for the standard combinators
        static init() {
            for (let type in combinators) {
                const combinator = combinators[type]
                // do not overwrite hand-written combinators
                Compiler.prototype[type] = Compiler.prototype[type] || function () {
                    const composition = new Composition({ type })
                    const skip = combinator.args && combinator.args.length || 0
                    if (!combinator.components && (arguments.length > skip)) {
                        throw new ComposerError('Too many arguments')
                    }
                    for (let i = 0; i < skip; ++i) {
                        const arg = combinator.args[i]
                        const argument = arg.optional ? arguments[i] || null : arguments[i]
                        switch (arg.type) {
                            case undefined:
                                composition[arg._] = this.task(argument)
                                continue
                            case 'value':
                                if (typeof argument === 'function') throw new ComposerError('Invalid argument', argument)
                                composition[arg._] = argument === undefined ? {} : argument
                                continue
                            case 'object':
                                if (argument === null || Array.isArray(argument)) throw new ComposerError('Invalid argument', argument)
                            default:
                                if (typeof argument !== arg.type) throw new ComposerError('Invalid argument', argument)
                                composition[arg._] = argument
                        }
                    }
                    if (combinator.components) {
                        composition.components = Array.prototype.slice.call(arguments, skip).map(obj => this.task(obj))
                    }
                    return composition
                }
            }
        }

        // return combinator list
        get combinators() {
            return combinators
        }

        // recursively deserialize composition
        deserialize(composition) {
            if (arguments.length > 1) throw new ComposerError('Too many arguments')
            composition = new Composition(composition) // copy
            composition.visit(composition => this.deserialize(composition))
            return composition
        }

        // label combinators with the json path
        label(composition) {
            if (arguments.length > 1) throw new ComposerError('Too many arguments')
            if (!(composition instanceof Composition)) throw new ComposerError('Invalid argument', composition)

            const label = path => (composition, name, array) => {
                composition = new Composition(composition) // copy
                composition.path = path + (name !== undefined ? (array === undefined ? `.${name}` : `[${name}]`) : '')
                // label nested combinators
                composition.visit(label(composition.path))
                return composition
            }

            return label('')(composition)
        }

        // recursively label and lower combinators to the desired set of combinators (including primitive combinators)
        lower(composition, combinators = []) {
            if (arguments.length > 2) throw new ComposerError('Too many arguments')
            if (!(composition instanceof Composition)) throw new ComposerError('Invalid argument', composition)
            if (!Array.isArray(combinators) && typeof combinators !== 'boolean' && typeof combinators !== 'string') throw new ComposerError('Invalid argument', combinators)

            if (combinators === false) return composition // no lowering
            if (combinators === true || combinators === '') combinators = [] // maximal lowering
            if (typeof combinators === 'string') { // lower to combinators of specific composer version 
                combinators = Object.keys(this.combinators).filter(key => semver.gte(combinators, this.combinators[key].since))
            }

            const lower = composition => {
                composition = new Composition(composition) // copy
                // repeatedly lower root combinator
                while (combinators.indexOf(composition.type) < 0 && this[`_${composition.type}`]) {
                    const path = composition.path
                    composition = this[`_${composition.type}`](composition)
                    if (path !== undefined) composition.path = path
                }
                // lower nested combinators
                composition.visit(lower)
                return composition
            }

            return lower(composition)
        }
    }

    Compiler.init()

    return { ComposerError, Composition, Compiler }
}

// composer module

function composer() {
    const fs = require('fs')
    const os = require('os')
    const path = require('path')
    const { minify } = require('uglify-es')

    // read composer version number
    const { version } = require('./package.json')

    // initialize compiler
    const { ComposerError, Composition, Compiler } = compiler()

    // capture compiler and conductor code (omitting composer code)
    const conductorCode = minify(`const main=(${conductor})(${compiler}())`, { output: { max_line_len: 127 }, mangle: { reserved: [Composition.name] } }).code

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

    // management class for compositions
    class Compositions {
        constructor(wsk, composer) {
            this.actions = wsk.actions
            this.composer = composer
        }

        deploy(composition, combinators) {
            if (arguments.length > 2) throw new ComposerError('Too many arguments')
            if (!(composition instanceof Composition)) throw new ComposerError('Invalid argument', composition)
            if (composition.type !== 'composition') throw new ComposerError('Cannot deploy anonymous composition')
            const obj = this.composer.encode(composition, combinators)
            return obj.actions.reduce((promise, action) => promise.then(() => this.actions.delete(action).catch(() => { }))
                .then(() => this.actions.update(action)), Promise.resolve())
                .then(() => obj)
        }
    }

    // enhanced client-side compiler
    class Composer extends Compiler {
        // enhanced action combinator: mangle name, capture code
        action(name, options = {}) {
            if (arguments.length > 2) throw new ComposerError('Too many arguments')
            name = parseActionName(name) // throws ComposerError if name is not valid
            let exec
            if (Array.isArray(options.sequence)) { // native sequence
                exec = { kind: 'sequence', components: options.sequence.map(parseActionName) }
            }
            if (typeof options.filename === 'string') { // read action code from file
                exec = fs.readFileSync(options.filename, { encoding: 'utf8' })
            }
            if (typeof options.action === 'function') { // capture function
                exec = `const main = ${options.action}`
                if (exec.indexOf('[native code]') !== -1) throw new ComposerError('Cannot capture native function', options.action)
            }
            if (typeof options.action === 'string' || typeof options.action === 'object' && options.action !== null && !Array.isArray(options.action)) {
                exec = options.action
            }
            if (typeof exec === 'string') {
                exec = { kind: 'nodejs:default', code: exec }
            }
            const composition = { type: 'action', name }
            if (exec) composition.action = { exec }
            return new Composition(composition)
        }

        // enhanced composition combinator: mangle name
        composition(name, composition) {
            if (arguments.length > 2) throw new ComposerError('Too many arguments')
            if (typeof name !== 'string') throw new ComposerError('Invalid argument', name)
            name = parseActionName(name)
            return new Composition({ type: 'composition', name, composition: this.task(composition) })
        }

        // return enhanced openwhisk client capable of deploying compositions
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
            wsk.compositions = new Compositions(wsk, this)
            return wsk
        }

        // recursively encode composition into { composition, actions } by encoding nested compositions into actions and extracting nested action definitions
        encode(composition, combinators = []) { // lower non-primitive combinators by default
            if (arguments.length > 2) throw new ComposerError('Too many arguments')
            if (!(composition instanceof Composition)) throw new ComposerError('Invalid argument', composition)

            composition = this.lower(composition, combinators)

            const actions = []

            const encode = composition => {
                composition = new Composition(composition) // copy
                composition.visit(encode)
                if (composition.type === 'composition') {
                    const code = `// generated by composer v${version}\n\nconst composition = ${JSON.stringify(encode(composition.composition), null, 4)}\n\n// do not edit below this point\n\n${conductorCode}` // invoke conductor on composition
                    composition.action = { exec: { kind: 'nodejs:default', code }, annotations: [{ key: 'conductor', value: composition.composition }, { key: 'composer', value: version }] }
                    delete composition.composition
                    composition.type = 'action'
                }
                if (composition.type === 'action' && composition.action) {
                    actions.push({ name: composition.name, action: composition.action })
                    delete composition.action
                }
                return composition
            }

            composition = encode(composition)
            return { composition, actions }
        }

        get version() {
            return version
        }
    }

    return new Composer()
}

module.exports = composer()

// conductor action

function conductor({ Compiler }) {
    const compiler = new Compiler()

    this.require = require

    function chain(front, back) {
        front.slice(-1)[0].next = 1
        front.push(...back)
        return front
    }

    function sequence(components) {
        if (components.length === 0) return [{ type: 'empty' }]
        return components.map(compile).reduce(chain)
    }

    function compile(json) {
        const path = json.path
        switch (json.type) {
            case 'sequence':
                return chain([{ type: 'pass', path }], sequence(json.components))
            case 'action':
                return [{ type: 'action', name: json.name, path }]
            case 'function':
                return [{ type: 'function', exec: json.function.exec, path }]
            case 'finally':
                var body = compile(json.body)
                const finalizer = compile(json.finalizer)
                var fsm = [[{ type: 'try', path }], body, [{ type: 'exit' }], finalizer].reduce(chain)
                fsm[0].catch = fsm.length - finalizer.length
                return fsm
            case 'let':
                var body = sequence(json.components)
                return [[{ type: 'let', let: json.declarations, path }], body, [{ type: 'exit' }]].reduce(chain)
            case 'mask':
                var body = sequence(json.components)
                return [[{ type: 'let', let: null, path }], body, [{ type: 'exit' }]].reduce(chain)
            case 'try':
                var body = compile(json.body)
                const handler = chain(compile(json.handler), [{ type: 'pass' }])
                var fsm = [[{ type: 'try', path }], body, [{ type: 'exit' }]].reduce(chain)
                fsm[0].catch = fsm.length
                fsm.slice(-1)[0].next = handler.length
                fsm.push(...handler)
                return fsm
            case 'if_nosave':
                var consequent = compile(json.consequent)
                var alternate = chain(compile(json.alternate), [{ type: 'pass' }])
                var fsm = [[{ type: 'pass', path }], compile(json.test), [{ type: 'choice', then: 1, else: consequent.length + 1 }]].reduce(chain)
                consequent.slice(-1)[0].next = alternate.length
                fsm.push(...consequent)
                fsm.push(...alternate)
                return fsm
            case 'while_nosave':
                var consequent = compile(json.body)
                var alternate = [{ type: 'pass' }]
                var fsm = [[{ type: 'pass', path }], compile(json.test), [{ type: 'choice', then: 1, else: consequent.length + 1 }]].reduce(chain)
                consequent.slice(-1)[0].next = 1 - fsm.length - consequent.length
                fsm.push(...consequent)
                fsm.push(...alternate)
                return fsm
            case 'dowhile_nosave':
                var test = compile(json.test)
                var fsm = [[{ type: 'pass', path }], compile(json.body), test, [{ type: 'choice', then: 1, else: 2 }]].reduce(chain)
                fsm.slice(-1)[0].then = 1 - fsm.length
                fsm.slice(-1)[0].else = 1
                var alternate = [{ type: 'pass' }]
                fsm.push(...alternate)
                return fsm
        }
    }

    const fsm = compile(compiler.lower(compiler.label(compiler.deserialize(composition))))

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
        if (params.$resume !== undefined) {
            if (!isObject(params.$resume)) return badRequest('The type of optional $resume parameter must be object')
            state = params.$resume.state
            stack = params.$resume.stack
            if (state !== undefined && typeof state !== 'number') return badRequest('The type of optional $resume.state parameter must be number')
            if (!Array.isArray(stack)) return badRequest('The type of $resume.stack must be an array')
            delete params.$resume
            inspect() // handle error objects when resuming
        }

        // wrap params if not a dictionary, branch to error handler if error
        function inspect() {
            if (!isObject(params)) params = { value: params }
            if (params.error !== undefined) {
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
            const view = []
            let n = 0
            for (let frame of stack) {
                if (frame.let === null) {
                    n++
                } else if (frame.let !== undefined) {
                    if (n === 0) {
                        view.push(frame)
                    } else {
                        n--
                    }
                }
            }

            // update value of topmost matching symbol on stack if any
            function set(symbol, value) {
                const element = view.find(element => element.let !== undefined && element.let[symbol] !== undefined)
                if (element !== undefined) element.let[symbol] = JSON.parse(JSON.stringify(value))
            }

            // collapse stack for invocation
            const env = view.reduceRight((acc, cur) => typeof cur.let === 'object' ? Object.assign(acc, cur.let) : acc, {})
            let main = '(function(){try{'
            for (const name in env) main += `var ${name}=arguments[1]['${name}'];`
            main += `return eval((${f}))(arguments[0])}finally{`
            for (const name in env) main += `arguments[1]['${name}']=${name};`
            main += '}})'
            try {
                return (1, eval)(main)(params, env)
            } finally {
                for (const name in env) set(name, env[name])
            }
        }

        while (true) {
            // final state, return composition result
            if (state === undefined) {
                console.log(`Entering final state`)
                console.log(JSON.stringify(params))
                if (params.error) return params; else return { params }
            }

            // process one state
            const json = fsm[state] // json definition for current state
            if (json.path !== undefined) console.log(`Entering composition${json.path}`)
            const current = state
            state = json.next === undefined ? undefined : current + json.next // default next state
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
                case 'exit':
                    if (stack.length === 0) return internalError(`State ${current} attempted to pop from an empty stack`)
                    stack.shift()
                    break
                case 'action':
                    return { action: json.name, params, state: { $resume: { state, stack } } } // invoke continuation
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
                    params = JSON.parse(JSON.stringify(result === undefined ? params : result))
                    inspect()
                    break
                case 'empty':
                    inspect()
                    break
                case 'pass':
                    break
                default:
                    return internalError(`State ${current} has an unknown type`)
            }
        }
    }
}
