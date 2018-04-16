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

// composer error class
class ComposerError extends Error {
    constructor(message, argument) {
        super(message + (argument !== undefined ? '\nArgument: ' + util.inspect(argument) : ''))
    }
}

// marker class for composition objects
class Composition {
    // weaker instanceof to tolerate multiple instances of this class
    static [Symbol.hasInstance](instance) {
        return instance.constructor && instance.constructor.name === 'Composition'
    }
}

// compiler class
class Compiler {
    // construct a composition object with the specified fields
    deserialize(composition) {
        return Object.assign(new Composition(), composition)
    }

    // detect task type and create corresponding composition object
    task(task) {
        if (arguments.length > 1) throw new ComposerError('Too many arguments')
        if (task === null) return this.seq()
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
        return this.deserialize({ type: 'function', function: { exec: fun } })
    }

    // standard combinators
    static get combinators() {
        return {
            seq: { components: true, lowered: true },
            sequence: { components: true },
            if: { args: [{ name: 'test', type: 'composition' }, { name: 'consequent', type: 'composition' }, { name: 'alternate', type: 'composition', optional: true }], lowered: true },
            if_nosave: { args: [{ name: 'test', type: 'composition' }, { name: 'consequent', type: 'composition' }, { name: 'alternate', type: 'composition', optional: true }] },
            while: { args: [{ name: 'test', type: 'composition' }, { name: 'body', type: 'composition' }], lowered: true },
            while_nosave: { args: [{ name: 'test', type: 'composition' }, { name: 'body', type: 'composition' }] },
            dowhile: { args: [{ name: 'body', type: 'composition' }, { name: 'test', type: 'composition' }], lowered: true },
            dowhile_nosave: { args: [{ name: 'body', type: 'composition' }, { name: 'test', type: 'composition' }] },
            try: { args: [{ name: 'body', type: 'composition' }, { name: 'handler', type: 'composition' }] },
            finally: { args: [{ name: 'body', type: 'composition' }, { name: 'finalizer', type: 'composition' }] },
            retain: { components: true, lowered: true },
            retain_catch: { components: true, lowered: true },
            let: { args: [{ name: 'declarations', type: 'object' }], components: true },
            mask: { components: true },
            action: { args: [{ name: 'name', type: 'string' }] },
            composition: { args: [{ name: 'name', type: 'string' }, { name: 'composition', type: 'composition' }] },
            repeat: { args: [{ name: 'count', type: 'number' }], components: true, lowered: true },
            retry: { args: [{ name: 'count', type: 'number' }], components: true, lowered: true },
            value: { args: [{ name: 'value', type: 'value' }], lowered: true },
            literal: { args: [{ name: 'value', type: 'value' }], lowered: true },
            function: { args: [{ name: 'function', type: 'object' }] }
        }
    }

    // define combinator methods for the standard combinators
    static init() {
        for (let type in Compiler.combinators) {
            const combinator = Compiler.combinators[type]
            // do not overwrite hand-written combinators
            Compiler.prototype[type] = Compiler.prototype[type] || function () {
                const composition = this.deserialize({ type })
                const skip = combinator.args && combinator.args.length || 0
                if (combinator.components) {
                    composition.components = Array.prototype.slice.call(arguments, skip).map(obj => this.task(obj))
                } else {
                    if (arguments.length > skip) throw new ComposerError('Too many arguments')
                }
                for (let i in combinator.args) {
                    const arg = combinator.args[i]
                    const argument = arg.optional ? arguments[i] || null : arguments[i]
                    switch (arg.type) {
                        case 'composition':
                            composition[arg.name] = this.task(argument)
                            continue
                        case 'value':
                            if (typeof argument === 'function') throw new ComposerError('Invalid argument', argument)
                            composition[arg.name] = argument === undefined ? {} : argument
                            continue
                        case 'string':
                            if (typeof argument !== 'string') throw new ComposerError('Invalid argument', argument)
                            break
                        case 'number':
                            if (typeof argument !== 'number') throw new ComposerError('Invalid argument', argument)
                            break
                        case 'object':
                            if (typeof argument !== 'object' || argument === null || Array.isArray(argument)) throw new ComposerError('Invalid argument', argument)
                            break
                    }
                    composition[arg.name] = argument
                }
                return composition
            }
        }
    }

    // recursively lower non-primitive combinators
    lower(composition, omitting = []) {
        if (arguments.length > 2) throw new ComposerError('Too many arguments')
        if (!(composition instanceof Composition)) throw new ComposerError('Invalid argument', composition)
        if (!Array.isArray(omitting)) throw new ComposerError('Invalid argument', omitting)

        // keep lowering root combinator
        while (true) {
            if (Compiler.combinators[composition.type].lowered && omitting.indexOf(composition.type) < 0) {
                switch (composition.type) {
                    case 'seq':
                        composition = this.sequence(...composition.components.map(this.deserialize))
                        continue
                    case 'value':
                    case 'literal':
                        composition = this.let({ value: composition.value }, () => value)
                        continue
                    case 'retain':
                        composition = this.let(
                            { params: null },
                            args => { params = args },
                            this.mask(...composition.components.map(this.deserialize)),
                            result => ({ params, result }))
                        continue
                    case 'retain_catch':
                        composition = this.seq(
                            this.retain(
                                this.finally(
                                    this.seq(...composition.components.map(this.deserialize)),
                                    result => ({ result }))),
                            ({ params, result }) => ({ params, result: result.result }))
                        continue
                    case 'if':
                        composition = this.let(
                            { params: null },
                            args => { params = args },
                            this.if_nosave(
                                this.mask(this.deserialize(composition.test)),
                                this.seq(() => params, this.mask(this.deserialize(composition.consequent))),
                                this.seq(() => params, this.mask(this.deserialize(composition.alternate)))))
                        continue
                    case 'while':
                        composition = this.let(
                            { params: null },
                            args => { params = args },
                            this.while_nosave(
                                this.mask(this.deserialize(composition.test)),
                                this.seq(() => params, this.mask(this.deserialize(composition.body)), args => { params = args })),
                            () => params)
                        continue
                    case 'dowhile':
                        composition = this.let(
                            { params: null },
                            args => { params = args },
                            this.dowhile_nosave(
                                this.seq(() => params, this.mask(this.deserialize(composition.body)), args => { params = args }),
                                this.mask(this.deserialize(composition.test))),
                            () => params)
                        continue
                    case 'repeat':
                        composition = this.let(
                            { count: composition.count },
                            this.while(
                                () => count-- > 0,
                                this.mask(this.seq(...composition.components.map(this.deserialize)))))
                        continue
                    case 'retry':
                        composition = this.let(
                            { count: composition.count },
                            params => ({ params }),
                            this.dowhile(
                                this.finally(({ params }) => params, this.mask(this.retain_catch(...composition.components.map(this.deserialize)))),
                                ({ result }) => typeof result.error !== 'undefined' && count-- > 0),
                            ({ result }) => result)
                        continue
                }
            }
            break // root combinator does not need lowering, break loop
        }

        // lower nested combinators
        composition = this.deserialize(composition) // copy composition
        const combinator = Compiler.combinators[composition.type]
        if (combinator.components) {
            composition.components = composition.components.map(component => this.lower(this.deserialize(component), omitting))
        }
        for (let i in combinator.args) {
            const arg = combinator.args[i]
            if (arg.type === 'composition') {
                composition[arg.name] = this.lower(this.deserialize(composition[arg.name]), omitting)
            }
        }
        return composition
    }
}

// composer module

const fs = require('fs')
const os = require('os')
const path = require('path')
const util = require('util')
const { minify } = require('uglify-es')

// read composer version number
const { version } = require('./package.json')

// capture compiler and conductor code (omitting composer code)
const conductorCode = minify(`${ComposerError}${Composition}${Compiler}const main=(${conductor})()`, { output: { max_line_len: 127 } }).code

// initialize compiler
Compiler.init()

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

    deploy(composition) {
        if (arguments.length > 1) throw new ComposerError('Too many arguments')
        if (!(composition instanceof Composition)) throw new ComposerError('Invalid argument', composition)
        if (composition.type !== 'composition') throw new ComposerError('Cannot deploy anonymous composition')
        const obj = this.composer.encode(composition)
        return obj.actions.reduce((promise, action) => promise.then(() => this.actions.delete(action).catch(() => { }))
            .then(() => this.actions.update(action)), Promise.resolve())
            .then(() => obj)
    }
}

// enhanced client-side compiler
class Composer extends Compiler {
    // return combinator list
    get combinators() {
        return Compiler.combinators
    }

    // enhanced action combinator: mangle name, capture code
    action(name, options = {}) {
        if (arguments.length > 2) throw new ComposerError('Too many arguments')
        name = parseActionName(name) // throws ComposerError if name is not valid
        if (typeof options === 'object') options = Object.assign({}, options)
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
        const composition = { type: 'action', name }
        if (exec) composition.action = { exec }
        return this.deserialize(composition)
    }

    // enhanced composition combinator: mangle name
    composition(name, composition) {
        if (arguments.length > 2) throw new ComposerError('Too many arguments')
        if (typeof name !== 'string') throw new ComposerError('Invalid argument', name)
        name = parseActionName(name)
        return this.deserialize({ type: 'composition', name, composition: this.task(composition) })
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

    // encode composition into { composition, actions } by encoding nested compositions into actions and extracting nested action definitions
    encode(composition) {
        if (arguments.length > 1) throw new ComposerError('Too many arguments')
        if (!(composition instanceof Composition)) throw new ComposerError('Invalid argument', composition)

        const actions = []

        const encode = composition => {
            composition = this.deserialize(composition) // copy
            Object.keys(composition).forEach(key => {
                if (composition[key] instanceof Composition) {
                    composition[key] = encode(composition[key])
                }
            })
            if (Array.isArray(composition.components)) {
                composition.components = composition.components.map(composition => encode(composition))
            }
            if (composition.type === 'composition') {
                const code = `// generated by composer v${version}\n\nconst composition = ${JSON.stringify(encode(composition.composition), null, 4)}\n\n// do not edit below this point\n\n${conductorCode}` // invoke conductor on composition
                composition.action = { exec: { kind: 'nodejs:default', code }, annotations: [{ key: 'conductor', value: composition.composition }] }
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
}

module.exports = new Composer()

// conductor action

function conductor() {
    Compiler.init()
    const compiler = new Compiler()

    this.require = require

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
                return [{ type: 'function', exec: json.function.exec, path }]
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
                return [[{ type: 'let', let: null, path }], body, [{ type: 'exit', path }]].reduce(chain)
            case 'try':
                var body = compile(json.body, path + '.body')
                const handler = chain(compile(json.handler, path + '.handler'), [{ type: 'pass', path }])
                var fsm = [[{ type: 'try', path }], body, [{ type: 'exit', path }]].reduce(chain)
                fsm[0].catch = fsm.length
                fsm.slice(-1)[0].next = handler.length
                fsm.push(...handler)
                return fsm
            case 'if_nosave':
                var consequent = compile(json.consequent, path + '.consequent')
                var alternate = chain(compile(json.alternate, path + '.alternate'), [{ type: 'pass', path }])
                var fsm = chain(compile(json.test, path + '.test'), [{ type: 'choice', then: 1, else: consequent.length + 1, path }])
                consequent.slice(-1)[0].next = alternate.length
                fsm.push(...consequent)
                fsm.push(...alternate)
                return fsm
            case 'while_nosave':
                var consequent = compile(json.body, path + '.body')
                var alternate = [{ type: 'pass', path }]
                var fsm = chain(compile(json.test, path + '.test'), [{ type: 'choice', then: 1, else: consequent.length + 1, path }])
                consequent.slice(-1)[0].next = 1 - fsm.length - consequent.length
                fsm.push(...consequent)
                fsm.push(...alternate)
                return fsm
            case 'dowhile_nosave':
                var test = compile(json.test, path + '.test')
                var fsm = [compile(json.body, path + '.body'), test, [{ type: 'choice', then: 1, else: 2, path }]].reduce(chain)
                fsm.slice(-1)[0].then = 1 - fsm.length
                fsm.slice(-1)[0].else = 1
                var alternate = [{ type: 'pass', path }]
                fsm.push(...alternate)
                return fsm
        }
    }

    const fsm = compile(compiler.lower(compiler.deserialize(composition)))

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
            const view = []
            let n = 0
            for (let i in stack) {
                if (stack[i].let === null) {
                    n++
                } else if (typeof stack[i].let !== 'undefined') {
                    if (n === 0) {
                        view.push(stack[i])
                    } else {
                        n--
                    }
                }
            }

            // update value of topmost matching symbol on stack if any
            function set(symbol, value) {
                const element = view.find(element => typeof element.let !== 'undefined' && typeof element.let[symbol] !== 'undefined')
                if (typeof element !== 'undefined') element.let[symbol] = JSON.parse(JSON.stringify(value))
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
