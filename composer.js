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

// compiler code shared between composer and conductor

class ComposerError extends Error {
    constructor(message, argument) {
        super(message + (typeof argument !== 'undefined' ? '\nArgument: ' + util.inspect(argument) : ''))
    }
}

class Composition {
}

class Compiler {
    deserialize(composition) {
        return Object.assign(new Composition(), composition)
    }

    task(obj) {
        if (arguments.length > 1) throw new ComposerError('Too many arguments')
        if (obj === null) return this.seq()
        if (obj.constructor && obj.constructor.name === 'Composition') return obj
        if (typeof obj === 'function') return this.function(obj)
        if (typeof obj === 'string') return this.action(obj)
        throw new ComposerError('Invalid argument', obj)
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
        return this.deserialize({ type: 'function', function: { exec: fun } })
    }

    static combinators() {
        return {
            seq: { components: true },
            sequence: { components: true },
            if: { args: [{ name: 'test', kind: 'composition' }, { name: 'consequent', kind: 'composition' }, { name: 'alternate', kind: 'composition', optional: true }] },
            if_nosave: { args: [{ name: 'test', kind: 'composition' }, { name: 'consequent', kind: 'composition' }, { name: 'alternate', kind: 'composition', optional: true }] },
            while: { args: [{ name: 'test', kind: 'composition' }, { name: 'body', kind: 'composition' }] },
            while_nosave: { args: [{ name: 'test', kind: 'composition' }, { name: 'body', kind: 'composition' }] },
            dowhile: { args: [{ name: 'body', kind: 'composition' }, { name: 'test', kind: 'composition' }] },
            dowhile_nosave: { args: [{ name: 'body', kind: 'composition' }, { name: 'test', kind: 'composition' }] },
            try: { args: [{ name: 'body', kind: 'composition' }, { name: 'handler', kind: 'composition' }] },
            finally: { args: [{ name: 'body', kind: 'composition' }, { name: 'finalizer', kind: 'composition' }] },
            retain: { components: true },
            retain_catch: { components: true },
            let: { args: [{ name: 'declarations', kind: 'object' }], components: true },
            mask: { components: true },
            repeat: { args: [{ name: 'count', kind: 'number' }], components: true },
            retry: { args: [{ name: 'count', kind: 'number' }], components: true },
            value: { args: [{ name: 'value', kind: 'value' }] },
            literal: { args: [{ name: 'value', kind: 'value' }] },
            action: { args: [{ name: 'name', kind: 'string' }] }
        }
    }

    static init() {
        for (let name in Compiler.combinators()) {
            const combinator = Compiler.combinators()[name]
            const composition = { type: name }
            Compiler.prototype[name] = function () {
                const skip = combinator.args && combinator.args.length || 0
                if (combinator.components) {
                    composition.components = Array.prototype.slice.call(arguments, skip).map(obj => this.task(obj))
                } else {
                    if (arguments.length > skip) throw new ComposerError('Too many arguments')
                }
                for (let j in combinator.args) {
                    const arg = combinator.args[j]
                    switch (arg.kind) {
                        case 'composition':
                            composition[arg.name] = this.task(arg.optional ? arguments[j] || null : arguments[j])
                            break
                        case 'number':
                            if (typeof arguments[j] !== 'number') throw new ComposerError('Invalid argument', arguments[j])
                            composition[arg.name] = arguments[j]
                            break
                        case 'object':
                            if (typeof arguments[j] !== 'object' || arguments[j] === null || Array.isArray(arguments[j])) throw new ComposerError('Invalid argument', arguments[j])
                            composition[arg.name] = arguments[j]
                            break
                        case 'value':
                            if (typeof arguments[j] === 'function') throw new ComposerError('Invalid argument', arguments[j])
                            composition[arg.name] = typeof arguments[j] === 'undefined' ? {} : arguments[j]
                            break
                        case 'string':
                            if (typeof arguments[j] !== 'string') throw new ComposerError('Invalid argument', arguments[j])
                            composition[arg.name] = arguments[j]
                            break
                    }
                }
                return this.deserialize(composition)
            }
        }
    }

    lower(composition) {
        switch (composition.type) {
            case 'value':
            case 'literal':
                return this.let({ value: composition.value }, () => value)
            case 'retain':
                return this.let(
                    { params: null },
                    args => { params = args },
                    this.mask(...composition.components.map(this.deserialize)),
                    result => ({ params, result }))
            case 'retain_catch':
                return this.seq(
                    this.retain(
                        this.finally(
                            this.seq(...composition.components.map(this.deserialize)),
                            result => ({ result }))),
                    ({ params, result }) => ({ params, result: result.result }))
            case 'if':
                return this.let(
                    { params: null },
                    args => { params = args },
                    this.if_nosave(
                        this.mask(this.deserialize(composition.test)),
                        this.seq(() => params, this.mask(this.deserialize(composition.consequent))),
                        this.seq(() => params, this.mask(this.deserialize(composition.alternate)))))
            case 'while':
                return this.let(
                    { params: null },
                    args => { params = args },
                    this.while_nosave(
                        this.mask(this.deserialize(composition.test)),
                        this.seq(() => params, this.mask(this.deserialize(composition.body)), args => { params = args })),
                    () => params)
            case 'dowhile':
                return this.let(
                    { params: null },
                    args => { params = args },
                    this.dowhile_nosave(
                        this.seq(() => params, this.mask(this.deserialize(composition.body)), args => { params = args }),
                        this.mask(this.deserialize(composition.test))),
                    () => params)
            case 'repeat':
                return this.let(
                    { count: composition.count },
                    this.while(
                        () => count-- > 0,
                        this.mask(this.seq(...composition.components.map(this.deserialize)))))
            case 'retry':
                return this.let(
                    { count: composition.count },
                    params => ({ params }),
                    this.dowhile(
                        this.finally(({ params }) => params, this.mask(this.retain_catch(...composition.components.map(this.deserialize)))),
                        ({ result }) => typeof result.error !== 'undefined' && count-- > 0),
                    ({ result }) => result)
            default:
            composition = Object.assign({}, composition)
                const combinator = Compiler.combinators()[composition.type]
                if (combinator.components) {
                    composition.components = composition.components.map(component => this.lower(component))
                }
                for (let j in combinator.args) {
                    const arg = combinator.args[j]
                    if (arg.kind === 'composition') {
                        composition[arg.name] = this.lower(composition[arg.name])
                    }
                }
                return composition
        }
    }
}

// composer module

Compiler.init()

const fs = require('fs')
const os = require('os')
const path = require('path')
const util = require('util')
const { version } = require('./package.json')
const { minify } = require('uglify-es')

const conductorCode = minify(`${ComposerError}${Composition}${Compiler}const main=(${conductor})()`, { output: { max_line_len: 127 } }).code

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

function encode(composition, actions) {
    composition = Object.assign({}, composition)
    Object.keys(composition).forEach(key => {
        if (composition[key].constructor && composition[key].constructor.name === 'Composition') {
            composition[key] = encode(composition[key], actions)
        }
    })
    if (Array.isArray(composition.components)) {
        composition.components = composition.components.map(composition => encode(composition, actions))
    }
    if (composition.type === 'composition') {
        const code = `// generated by composer v${version}\n\nconst composition = ${JSON.stringify(encode(composition.composition, actions), null, 4)}\n\n// do not edit below this point\n\n${conductorCode}` // invoke conductor on composition
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

class Compositions {
    constructor(wsk, composer) {
        this.actions = wsk.actions
        this.composer = composer
    }

    deploy(composition, name) {
        if (arguments.length > 2) throw new ComposerError('Too many arguments')
        if (!(composition.constructor && composition.constructor.name === 'Composition')) throw new ComposerError('Invalid argument', composition)
        const obj = this.composer.encode(composition, name)
        if (obj.composition.type !== 'action') throw new ComposerError('Cannot deploy anonymous composition')
        return obj.actions.reduce((promise, action) => promise.then(() => this.actions.delete(action).catch(() => { }))
            .then(() => this.actions.update(action)), Promise.resolve())
            .then(() => obj)
    }
}

class Composer extends Compiler {
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

    composition(name, composition) {
        if (arguments.length > 2) throw new ComposerError('Too many arguments')
        if (typeof name !== 'string') throw new ComposerError('Invalid argument', name)
        name = parseActionName(name)
        return this.deserialize({ type: 'composition', name, composition: this.task(composition) })
    }

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

    encode(composition, name) {
        if (arguments.length > 2) throw new ComposerError('Too many arguments')
        if (typeof name !== 'undefined' && typeof name !== 'string') throw new ComposerError('Invalid argument', name)
        const actions = []
        composition = encode(typeof name === 'string' ? this.composition(name, composition) : composition, actions)
        return { composition, actions }
    }
}

module.exports = new Composer()

// conductor action

function conductor() {
    Compiler.init()
    const composer = new Compiler()

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
            case 'seq':
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
            default:
                return compile(composer.lower(json))
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
