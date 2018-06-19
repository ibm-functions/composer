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

function main() {
    'use strict'

    const fs = require('fs')
    const os = require('os')
    const path = require('path')
    const semver = require('semver')
    const util = require('util')

    // read composer version number
    const version = require('./package.json').version

    const isObject = obj => typeof obj === 'object' && obj !== null && !Array.isArray(obj)

    // combinator signatures
    const combinators = {}

    // error class
    class ComposerError extends Error {
        constructor(message, argument) {
            super(message + (argument !== undefined ? '\nArgument: ' + util.inspect(argument) : ''))
        }
    }

    // registered plugins
    const plugins = []

    const composer = {}
    Object.assign(composer, {
        // detect task type and create corresponding composition object
        task(task) {
            if (arguments.length > 1) throw new ComposerError('Too many arguments')
            if (task === null) return composer.empty()
            if (task instanceof Composition) return task
            if (typeof task === 'function') return composer.function(task)
            if (typeof task === 'string') return composer.action(task)
            throw new ComposerError('Invalid argument', task)
        },

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
            if (!isObject(fun)) throw new ComposerError('Invalid argument', fun)
            return new Composition({ type: 'function', function: { exec: fun } })
        },

        // action combinator
        action(name, options = {}) {
            if (arguments.length > 2) throw new ComposerError('Too many arguments')
            if (!isObject(options)) throw new ComposerError('Invalid argument', options)
            name = composer.util.canonical(name) // throws ComposerError if name is not valid
            let exec
            if (Array.isArray(options.sequence)) { // native sequence
                exec = { kind: 'sequence', components: options.sequence.map(canonical) }
            } else if (typeof options.filename === 'string') { // read action code from file
                exec = fs.readFileSync(options.filename, { encoding: 'utf8' })
            } else if (typeof options.action === 'function') { // capture function
                exec = `const main = ${options.action}`
                if (exec.indexOf('[native code]') !== -1) throw new ComposerError('Cannot capture native function', options.action)
            } else if (typeof options.action === 'string' || isObject(options.action)) {
                exec = options.action
            }
            if (typeof exec === 'string') {
                exec = { kind: 'nodejs:default', code: exec }
            }
            const composition = { type: 'action', name }
            if (exec) composition.action = { exec }
            return new Composition(composition)
        },
    })

    const lowerer = {
        empty() {
            return composer.sequence()
        },

        seq({ components }) {
            return composer.sequence(...components)
        },

        value({ value }) {
            return composer.literal(value)
        },

        literal({ value }) {
            return composer.let({ value }, composer.function('() => value'))
        },

        retain({ components }) {
            return composer.let(
                { params: null },
                composer.finally(
                    args => { params = args },
                    composer.seq(composer.mask(...components),
                        result => ({ params, result }))))
        },

        retain_catch({ components }) {
            return composer.seq(
                composer.retain(
                    composer.finally(
                        composer.seq(...components),
                        result => ({ result }))),
                ({ params, result }) => ({ params, result: result.result }))
        },

        if({ test, consequent, alternate }) {
            return composer.let(
                { params: null },
                composer.finally(
                    args => { params = args },
                    composer.if_nosave(
                        composer.mask(test),
                        composer.finally(() => params, composer.mask(consequent)),
                        composer.finally(() => params, composer.mask(alternate)))))
        },

        while({ test, body }) {
            return composer.let(
                { params: null },
                composer.finally(
                    args => { params = args },
                    composer.seq(composer.while_nosave(
                        composer.mask(test),
                        composer.finally(() => params, composer.seq(composer.mask(body), args => { params = args }))),
                        () => params)))
        },

        dowhile({ body, test }) {
            return composer.let(
                { params: null },
                composer.finally(
                    args => { params = args },
                    composer.seq(composer.dowhile_nosave(
                        composer.finally(() => params, composer.seq(composer.mask(body), args => { params = args })),
                        composer.mask(test)),
                        () => params)))
        },

        repeat({ count, components }) {
            return composer.let(
                { count },
                composer.while(
                    composer.function('() => count-- > 0'),
                    composer.mask(...components)))
        },

        retry({ count, components }) {
            return composer.let(
                { count },
                params => ({ params }),
                composer.dowhile(
                    composer.finally(({ params }) => params, composer.mask(composer.retain_catch(...components))),
                    composer.function('({ result }) => result.error !== undefined && count-- > 0')),
                ({ result }) => result)
        },
    }

    // recursively flatten composition into { composition, actions } by extracting embedded action definitions
    function flatten(composition) {
        if (arguments.length > 1) throw new ComposerError('Too many arguments')
        if (!(composition instanceof Composition)) throw new ComposerError('Invalid argument', composition)

        const actions = []

        const flatten = composition => {
            composition = new Composition(composition) // copy
            composition.visit(flatten)
            if (composition.type === 'action' && composition.action) {
                actions.push({ name: composition.name, action: composition.action })
                delete composition.action
            }
            return composition
        }

        composition = flatten(composition)
        return { composition, actions }
    }

    // synthesize composition code
    function synthesize(composition) {
        if (arguments.length > 1) throw new ComposerError('Too many arguments')
        if (!(composition instanceof Composition)) throw new ComposerError('Invalid argument', composition)
        let code = `const main=(${main})().runtime(`
        for (let plugin of plugins) {
            code += `{plugin:new(${plugin.constructor})()`
            if (plugin.configure) code += `,config:${JSON.stringify(plugin.configure())}`
            code += '},'
        }
        code = require('uglify-es').minify(`${code})`, { output: { max_line_len: 127 } }).code
        code = `// generated by composer v${version}\n\nconst composition = ${JSON.stringify(composition, null, 4)}\n\n// do not edit below this point\n\n${code}` // invoke conductor on composition
        return { exec: { kind: 'nodejs:default', code }, annotations: [{ key: 'conductor', value: composition }, { key: 'composer', value: version }] }
    }

    composer.util = {
        // return the signatures of the combinators
        get combinators() {
            return combinators
        },

        // recursively deserialize composition
        deserialize(composition) {
            if (arguments.length > 1) throw new ComposerError('Too many arguments')
            composition = new Composition(composition) // copy
            composition.visit(composition => composer.util.deserialize(composition))
            return composition
        },

        // recursively lower combinators to the desired set of combinators (including primitive combinators)
        lower(composition, combinators = []) {
            if (arguments.length > 2) throw new ComposerError('Too many arguments')
            if (!(composition instanceof Composition)) throw new ComposerError('Invalid argument', composition)
            if (typeof combinators === 'string') { // lower to combinators of specific composer version 
                combinators = Object.keys(composer.util.combinators).filter(key => semver.gte(combinators, composer.util.combinators[key].since))
            }
            if (!Array.isArray(combinators)) throw new ComposerError('Invalid argument', combinators)

            const lower = composition => {
                composition = new Composition(composition) // copy
                // repeatedly lower root combinator
                while (combinators.indexOf(composition.type) < 0 && lowerer[composition.type]) {
                    const path = composition.path
                    composition = lowerer[composition.type](composition)
                    if (path !== undefined) composition.path = path // preserve path
                }
                // lower nested combinators
                composition.visit(lower)
                return composition
            }

            return lower(composition)
        },

        // register plugin
        register(plugin) {
            if (plugin.combinators) init(plugin.combinators())
            if (plugin.composer) Object.assign(composer, plugin.composer({ composer, ComposerError, Composition }))
            if (plugin.lowerer) Object.assign(lowerer, plugin.lowerer({ composer, ComposerError, Composition }))
            plugins.push(plugin)
            return composer
        },

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
        canonical(name) {
            if (typeof name !== 'string') throw new ComposerError('Name must be a string')
            if (name.trim().length == 0) throw new ComposerError('Name is not valid')
            name = name.trim()
            const delimiter = '/'
            const parts = name.split(delimiter)
            const n = parts.length
            const leadingSlash = name[0] == delimiter
            // no more than /ns/p/a
            if (n < 1 || n > 4 || (leadingSlash && n == 2) || (!leadingSlash && n == 4)) throw new ComposerError('Name is not valid')
            // skip leading slash, all parts must be non empty (could tighten this check to match EntityName regex)
            parts.forEach(function (part, i) { if (i > 0 && part.trim().length == 0) throw new ComposerError('Name is not valid') })
            const newName = parts.join(delimiter)
            if (leadingSlash) return newName
            else if (n < 3) return `${delimiter}_${delimiter}${newName}`
            else return `${delimiter}${newName}`
        },

        // encode composition as an action table
        encode(name, composition, combinators) {
            if (arguments.length > 3) throw new ComposerError('Too many arguments')
            name = composer.util.canonical(name) // throws ComposerError if name is not valid
            if (!(composition instanceof Composition)) throw new ComposerError('Invalid argument', composition)
            if (combinators) composition = composer.util.lower(composition, combinators)
            const table = flatten(composition)
            table.actions.push({ name, action: synthesize(table.composition) })
            return table.actions
        },

        // return composer version
        get version() {
            return version
        },

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
            wsk.compositions = new Compositions(wsk)
            return wsk
        },
    }

    // composition class
    class Composition {
        // weaker instanceof to tolerate multiple instances of this class
        static [Symbol.hasInstance](instance) {
            return instance.constructor && instance.constructor.name === Composition.name
        }

        // construct a composition object with the specified fields
        constructor(composition) {
            if (!isObject(composition) || composer.util.combinators[composition.type] === undefined) throw new ComposerError('Invalid argument', composition)
            const combinator = composer.util.combinators[composition.type]
            if (combinator.components && composition.components === undefined)throw new ComposerError('Invalid argument', composition)
            for (let arg of combinator.args || []) {
                if (!arg.optional && composition[arg._] === undefined) throw new ComposerError('Invalid argument', composition)
            }
            return Object.assign(this, composition)
        }

        // apply f to all fields of type composition
        visit(f) {
            const combinator = composer.util.combinators[this.type]
            if (combinator.components) {
                this.components = this.components.map(f)
            }
            for (let arg of combinator.args || []) {
                if (arg.type === undefined && this[arg._] !== undefined) {
                    this[arg._] = f(this[arg._], arg._)
                }
            }
        }
    }

    // derive combinator methods from combinator table
    function init(combinators) {
        Object.assign(composer.util.combinators, combinators)
        for (let type in combinators) {
            const combinator = combinators[type]
            // do not overwrite existing combinators
            composer[type] = composer[type] || function () {
                const composition = { type }
                const skip = combinator.args && combinator.args.length || 0
                if (!combinator.components && (arguments.length > skip)) {
                    throw new ComposerError('Too many arguments')
                }
                for (let i = 0; i < skip; ++i) {
                    const arg = combinator.args[i]
                    const argument = arguments[i]
                    if (argument === undefined && arg.optional && arg.type !== undefined) continue
                    switch (arg.type) {
                        case undefined:
                            composition[arg._] = composer.task(arg.optional ? argument || null : argument)
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
                    composition.components = Array.prototype.slice.call(arguments, skip).map(obj => composer.task(obj))
                }
                return new Composition(composition)
            }
        }
    }

    init({
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
        repeat: { args: [{ _: 'count', type: 'number' }], components: true, since: '0.4.0' },
        retry: { args: [{ _: 'count', type: 'number' }], components: true, since: '0.4.0' },
        value: { args: [{ _: 'value', type: 'value' }], since: '0.4.0' },
        literal: { args: [{ _: 'value', type: 'value' }], since: '0.4.0' },
        function: { args: [{ _: 'function', type: 'object' }], since: '0.4.0' },
        async: { args: [{ _: 'body' }], since: '0.6.0' },
    })

    // management class for compositions
    class Compositions {
        constructor(wsk) {
            this.actions = wsk.actions
        }

        deploy(name, composition, combinators) {
            const actions = composer.util.encode(name, composition, combinators)
            return actions.reduce((promise, action) => promise.then(() => this.actions.delete(action).catch(() => { }))
                .then(() => this.actions.update(action)), Promise.resolve())
                .then(() => actions)
        }
    }

    // runtime stuff
    function runtime() {
        // recursively label combinators with the json path
        function label(composition) {
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

        // compile ast to fsm
        const compiler = {
            sequence(node) {
                return [{ type: 'pass', path: node.path }, ...compile(...node.components)]
            },

            action(node) {
                return [{ type: 'action', name: node.name, path: node.path }]
            },

            async(node) {
                const body = compile(node.body)
                return [{ type: 'async', path: node.path, return: body.length + 2 }, ...body, { type: 'stop' }, { type: 'pass' }]
            },

            function(node) {
                return [{ type: 'function', exec: node.function.exec, path: node.path }]
            },

            finally(node) {
                const finalizer = compile(node.finalizer)
                const fsm = [{ type: 'try', path: node.path }, ...compile(node.body), { type: 'exit' }, ...finalizer]
                fsm[0].catch = fsm.length - finalizer.length
                return fsm
            },

            let(node) {
                return [{ type: 'let', let: node.declarations, path: node.path }, ...compile(...node.components), { type: 'exit' }]
            },

            mask(node) {
                return [{ type: 'let', let: null, path: node.path }, ...compile(...node.components), { type: 'exit' }]
            },

            try(node) {
                const handler = [...compile(node.handler), { type: 'pass' }]
                const fsm = [{ type: 'try', path: node.path }, ...compile(node.body), { type: 'exit' }, ...handler]
                fsm[0].catch = fsm.length - handler.length
                fsm[fsm.length - handler.length - 1].next = handler.length
                return fsm
            },

            if_nosave(node) {
                const consequent = compile(node.consequent)
                const alternate = [...compile(node.alternate), { type: 'pass' }]
                const fsm = [{ type: 'pass', path: node.path }, ...compile(node.test), { type: 'choice', then: 1, else: consequent.length + 1 }, ...consequent, ...alternate]
                fsm[fsm.length - alternate.length - 1].next = alternate.length
                return fsm
            },

            while_nosave(node) {
                const body = compile(node.body)
                const fsm = [{ type: 'pass', path: node.path }, ...compile(node.test), { type: 'choice', then: 1, else: body.length + 1 }, ...body, { type: 'pass' }]
                fsm[fsm.length - 2].next = 2 - fsm.length
                return fsm
            },

            dowhile_nosave(node) {
                const fsm = [{ type: 'pass', path: node.path }, ...compile(node.body), ...compile(node.test), { type: 'choice', else: 1 }, { type: 'pass' }]
                fsm[fsm.length - 2].then = 2 - fsm.length
                return fsm
            },
        }

        function compile(node) {
            if (arguments.length === 0) return [{ type: 'empty' }]
            if (arguments.length === 1) return compiler[node.type](node)
            return Array.prototype.reduce.call(arguments, (fsm, node) => { fsm.push(...compile(node)); return fsm }, [])
        }

        const openwhisk = require('openwhisk')
        let wsk

        const conductor = {
            choice({ p, node, index }) {
                p.s.state = index + (p.params.value ? node.then : node.else)
            },

            try({ p, node, index }) {
                p.s.stack.unshift({ catch: index + node.catch })
            },

            let({ p, node, index }) {
                p.s.stack.unshift({ let: JSON.parse(JSON.stringify(node.let)) })
            },

            exit({ p, node, index }) {
                if (p.s.stack.length === 0) return internalError(`State ${index} attempted to pop from an empty stack`)
                p.s.stack.shift()
            },

            action({ p, node, index }) {
                return { action: node.name, params: p.params, state: { $resume: p.s } }
            },

            function({ p, node, index }) {
                return Promise.resolve().then(() => run(node.exec.code, p))
                    .catch(error => {
                        console.error(error)
                        return { error: `An exception was caught at state ${index} (see log for details)` }
                    })
                    .then(result => {
                        if (typeof result === 'function') result = { error: `State ${index} evaluated to a function` }
                        // if a function has only side effects and no return value, return params
                        p.params = JSON.parse(JSON.stringify(result === undefined ? p.params : result))
                        inspect(p)
                        return step(p)
                    })
            },

            empty({ p, node, index }) {
                inspect(p)
            },

            pass({ p, node, index }) {
            },

            async({ p, node, index, inspect, step }) {
                if (!wsk) wsk = openwhisk({ ignore_certs: true })
                p.params.$resume = { state: p.s.state }
                p.s.state = index + node.return
                return wsk.actions.invoke({ name: process.env.__OW_ACTION_NAME, params: p.params })
                    .catch(error => {
                        console.error(error)
                        return { error: `An exception was caught at state ${index} (see log for details)` }
                    })
                    .then(result => {
                        p.params = result
                        inspect(p)
                        return step(p)
                    })
            },

            stop({ p, node, index, inspect, step }) {
                p.s.state = -1
            },
        }

        const finishers = []

        for (let { plugin, config } of arguments) {
            composer.util.register(plugin)
            if (plugin.compiler) Object.assign(compiler, plugin.compiler({ compile }))
            if (plugin.conductor) {
                Object.assign(conductor, plugin.conductor(config))
                if (conductor._finish) {
                    finishers.push(conductor._finish)
                    delete conductor._finish
                }
            }
        }

        const fsm = compile(composer.util.lower(label(composer.util.deserialize(composition))))

        // encode error object
        const encodeError = error => ({
            code: typeof error.code === 'number' && error.code || 500,
            error: (typeof error.error === 'string' && error.error) || error.message || (typeof error === 'string' && error) || 'An internal error occurred'
        })

        // error status codes
        const badRequest = error => Promise.reject({ code: 400, error })
        const internalError = error => Promise.reject(encodeError(error))

        // wrap params if not a dictionary, branch to error handler if error
        function inspect(p) {
            if (!isObject(p.params)) p.params = { value: p.params }
            if (p.params.error !== undefined) {
                p.params = { error: p.params.error } // discard all fields but the error field
                p.s.state = -1 // abort unless there is a handler in the stack
                while (p.s.stack.length > 0) {
                    if ((p.s.state = p.s.stack.shift().catch || -1) >= 0) break
                }
            }
        }

        // run function f on current stack
        function run(f, p) {
            // handle let/mask pairs
            const view = []
            let n = 0
            for (let frame of p.s.stack) {
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
            const env = view.reduceRight((acc, cur) => cur.let ? Object.assign(acc, cur.let) : acc, {})
            let main = '(function(){try{'
            for (const name in env) main += `var ${name}=arguments[1]['${name}'];`
            main += `return eval((${f}))(arguments[0])}finally{`
            for (const name in env) main += `arguments[1]['${name}']=${name};`
            main += '}})'
            try {
                return (1, eval)(main)(p.params, env)
            } finally {
                for (const name in env) set(name, env[name])
            }
        }

        function step(p) {
            // final state, return composition result
            if (p.s.state < 0 || p.s.state >= fsm.length) {
                console.log(`Entering final state`)
                console.log(JSON.stringify(p.params))
                return finishers.reduce((promise, _finish) => promise.then(() => _finish(p)), Promise.resolve())
                    .then(() => p.params.error ? p.params : { params: p.params })
            }

            // process one state
            const node = fsm[p.s.state] // json definition for index state
            if (node.path !== undefined) console.log(`Entering composition${node.path}`)
            const index = p.s.state // current state
            p.s.state = p.s.state + (node.next || 1) // default next state
            return conductor[node.type]({ p, index, node, inspect, step }) || step(p)
        }

        return params => Promise.resolve().then(() => invoke(params)).catch(internalError)

        // do invocation
        function invoke(params) {
            const p = { s: { state: 0, stack: [] }, params } // initial state

            if (params.$resume !== undefined) {
                if (!isObject(params.$resume)) return badRequest('The type of optional $resume parameter must be object')
                const resuming = params.$resume.stack
                Object.assign(p.s, params.$resume)
                if (typeof p.s.state !== 'number') return badRequest('The type of optional $resume.state parameter must be number')
                if (!Array.isArray(p.s.stack)) return badRequest('The type of optional $resume.stack parameter must be an array')
                delete params.$resume
                if (resuming) inspect(p) // handle error objects when resuming
            }

            return step(p)
        }
    }

    return { composer, runtime }
}

module.exports = main().composer
