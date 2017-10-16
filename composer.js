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

const clone = require('clone')
const util = require('util')
const fs = require('fs')

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
    return front
}

function push(id) {
    const Entry = { Type: 'Push', id }
    return { Entry, States: [Entry], Exit: Entry }
}

function pop(id) {
    const Entry = { Type: 'Pop', id }
    return { Entry, States: [Entry], Exit: Entry }
}

function begin(id, symbol, value) {
    const Entry = { Type: 'Let', Symbol: symbol, Value: value, id }
    return { Entry, States: [Entry], Exit: Entry }
}

function end(id) {
    const Entry = { Type: 'End', id }
    return { Entry, States: [Entry], Exit: Entry }
}

const isObject = obj => typeof (obj) === 'object' && obj !== null && !Array.isArray(obj)

class Composer {
    task(obj, options) {
        if (options != null && options.output) return this.assign(options.output, obj, options.input)
        if (options != null && options.merge) return this.sequence(this.retain(obj), ({ params, result }) => Object.assign({}, params, result))
        const id = {}
        let Entry
        if (obj == null) { // identity function (must throw errors if any)
            Entry = { Type: 'Task', Helper: 'null', Function: 'params => params', id }
        } else if (typeof obj === 'object' && typeof obj.Entry === 'object' && Array.isArray(obj.States) && typeof obj.Exit === 'object') { // an action composition
            return clone(obj)
        } else if (typeof obj === 'object' && typeof obj.Entry === 'string' && typeof obj.States === 'object' && typeof obj.Exit === 'string') { // a compiled composition
            return this.decompile(obj)
        } else if (typeof obj === 'function') { // function
            Entry = { Type: 'Task', Function: obj.toString(), id }
        } else if (typeof obj === 'string') { // action
            Entry = { Type: 'Task', Action: obj, id }
        } else if (typeof obj === 'object' && typeof obj.Helper !== 'undefined' && typeof obj.Function === 'string') { //helper function
            Entry = { Type: 'Task', Function: obj.Function, Helper: obj.Helper, id }
        } else { // error
            throw new ComposerError('Invalid composition argument', obj)
        }
        return { Entry, States: [Entry], Exit: Entry }
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
        return { Entry, States, Exit }
    }

    retain(body, flag = false) {
        if (body == null) throw new ComposerError('Missing arguments in composition', arguments)
        if (typeof flag !== 'boolean') throw new ComposerError('Invalid retain flag', flag)

        const id = {}
        if (!flag) return chain(push(id), chain(this.task(body), pop(id)))

        let helperFunc_1 = { 'Helper': 'retain_1', 'Function': 'params => ({params})' }
        let helperFunc_3 = { 'Helper': 'retain_3', 'Function': 'params => ({params})' }
        let helperFunc_2 = { 'Helper': 'retain_2', 'Function': 'params => ({ params: params.params, result: params.result.params })' }

        return this.sequence(
            this.retain(
                this.try(
                    this.sequence(
                        body,
                        helperFunc_1
                    ),
                    helperFunc_3
                )
            ),
            helperFunc_2
        )
    }

    assign(dest, body, source, flag = false) {
        if (dest == null || body == null) throw new ComposerError('Missing arguments in composition', arguments)
        if (typeof flag !== 'boolean') throw new ComposerError('Invalid assign flag', flag)

        let helperFunc_1 = { 'Helper': 'assign_1', 'Function': 'params => params[source]' };
        let helperFunc_2 = { 'Helper': 'assign_2', 'Function': 'params => { params.params[dest] = params.result; return params.params }' };

        const t = source ? this.let('source', source, this.retain(this.sequence(helperFunc_1, body), flag)) : this.retain(body, flag)
        return this.let('dest', dest, t, helperFunc_2)
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

        let helperFunc_1 = { 'Helper': 'retry_1', 'Function': "params => typeof params.result.error !== 'undefined' && count-- > 0" }
        let helperFunc_2 = { 'Helper': 'retry_2', 'Function': 'params => params.params' }
        let helperFunc_3 = { 'Helper': 'retry_3', 'Function': 'params => params.result' }

        return this.let('count', count,
            this.retain(body, true),
            this.while(
                helperFunc_1,
                this.sequence(helperFunc_2, this.retain(body, true))),
            helperFunc_3)
    }

    repeat(count, body) {
        if (body == null) throw new ComposerError('Missing arguments in composition', arguments)
        if (typeof count !== 'number') throw new ComposerError('Invalid repeat count', count)

        let helperFunc_1 = { 'Helper': 'repeat_1', 'Function': '() => count-- > 0' }
        return this.let('count', count, this.while(helperFunc_1, body))
    }

    value(json) {
        const id = {}
        if (typeof json === 'function') throw new ComposerError('Value cannot be a function', json.toString())
        const Entry = { Type: 'Task', Value: typeof json === 'undefined' ? {} : json, id }
        return { Entry, States: [Entry], Exit: Entry }
    }

    compile(obj, filename) {
        if (typeof obj !== 'object' || typeof obj.Entry !== 'object' || !Array.isArray(obj.States) || typeof obj.Exit !== 'object') {
            throw new ComposerError('Invalid argument to compile', obj)
        }
        obj = clone(obj)
        const States = {}
        let Entry
        let Exit
        let Count = 0
        obj.States.forEach(state => {
            if (typeof state.id.id === 'undefined') state.id.id = Count++
        })
        obj.States.forEach(state => {
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
        const app = { Entry, States, Exit }
        if (filename) fs.writeFileSync(filename, JSON.stringify(app, null, 4), { encoding: 'utf8' })
        return app
    }

    decompile(obj) {
        if (typeof obj !== 'object' || typeof obj.Entry !== 'string' || typeof obj.States !== 'object' || typeof obj.Exit !== 'string') {
            throw new ComposerError('Invalid argument to decompile', obj)
        }
        obj = clone(obj)
        const States = []
        const ids = []
        for (const name in obj.States) {
            const state = obj.States[name]
            if (state.Next) state.Next = obj.States[state.Next]
            if (state.Then) state.Then = obj.States[state.Then]
            if (state.Else) state.Else = obj.States[state.Else]
            if (state.Handler) state.Handler = obj.States[state.Handler]
            const id = parseInt(name.substring(name.lastIndexOf('_') + 1))
            state.id = ids[id] = typeof ids[id] !== 'undefined' ? ids[id] : {}
            States.push(state)
        }
        return { Entry: obj.States[obj.Entry], States, Exit: obj.States[obj.Exit] }
    }
}

module.exports = new Composer()
