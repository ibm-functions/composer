const assert = require('assert')
const composer = require('../composer')
const harness = require('../test-harness')()
const wsk = harness.wsk
const mgr = harness.mgr
const run = params => wsk.actions.invoke({ name: 'conductor', params, blocking: true })
const invoke = (task, params, $blocking = true) => run(Object.assign({ $invoke: composer.compile(task), $blocking }, params))

let activationId

describe('composer', function () {
    this.timeout(60000)

    before('deploy conductor and sample actions', function () {
        return harness.deploy()
            .then(() => wsk.actions.update({ name: 'DivideByTwo', action: 'function main({n}) { return { n: n / 2 } }' }))
            .then(() => wsk.actions.update({ name: 'TripleAndIncrement', action: 'function main({n}) { return { n: n * 3 + 1 } }' }))
            .then(() => wsk.actions.update({ name: 'isNotOne', action: 'function main({n}) { return { value: n != 1 } }' }))
            .then(() => wsk.actions.update({ name: 'isEven', action: 'function main({n}) { return { value: n % 2  == 0 } }' }))
    })

    it('flush', function () {
        return mgr.flush()
    })

    it('history must be clean', function () {
        return mgr.list().then(result => assert.ok(Array.isArray(result.live) && Array.isArray(result.done) && typeof result.next === 'number'
            && result.live.length === 0 && result.done.length === 0 && result.next === 0))
    })

    describe('first composition', function () {
        it('identity task must return input object', function () {
            return invoke(composer.task(), { foo: 'bar' }).then(activation => {
                activationId = activation.activationId
                return assert.deepEqual(activation.response.result, { foo: 'bar' })
            })
        })

        it('check history', function () {
            return mgr.list().then(result => assert.ok(result.live.length === 0 && result.done.length === 1 && result.done[0] === activationId && result.next === 0))
        })

        it('check trace', function () {
            return mgr.trace(activationId).then(result => assert.ok(result.trace.length === 1 && result.trace[0] === activationId))
        })
    })

    describe('invalid conductor invocations', function () {
        it('missing both $sessionId and $invoke must fail with 400', function () {
            return run({}).then(() => assert.fail(), activation => assert.equal(activation.error.response.result.error.code, 400))
        })
    })

    describe('nonexistent session', function () {
        it('resume nonexistent session must fail with 404 (and not record session result)', function () {
            return run({ $sessionId: 'foo', $invoke: composer.task(), params: {} }).then(() => assert.fail(), activation => assert.equal(activation.error.response.result.error.code, 404))
        })

        it('get nonexistent session must throw', function () {
            return mgr.get('foo').then(() => assert.fail(), result => assert.equal(result, 'Cannot find result of session foo'))
        })

        it('kill nonexistent session must throw', function () {
            return mgr.kill('foo').then(() => assert.fail(), result => assert.equal(result, 'Cannot find live session foo'))
        })

        it('purge nonexistent session must throw', function () {
            return mgr.purge('foo').then(() => assert.fail(), result => assert.equal(result, 'Cannot find session foo'))
        })

        it('trace nonexistent session must throw', function () {
            return mgr.trace('foo').then(() => assert.fail(), result => assert.equal(result, 'Cannot find trace for session foo'))
        })
    })

    describe('blocking invocations', function () {
        describe('tasks', function () {
            describe('actions', function () {
                it('action must return true', function () {
                    return invoke(composer.task('isNotOne'), { n: 0 }).then(activation => assert.deepEqual(activation.response.result, { value: true }))
                })

                it('action must return false', function () {
                    return invoke(composer.task('isNotOne'), { n: 1 }).then(activation => assert.deepEqual(activation.response.result, { value: false }))
                })
            })

            describe('functions', function () {
                it('function must return true', function () {
                    return invoke(composer.task(({ n }) => n % 2 === 0), { n: 4 }).then(activation => assert.deepEqual(activation.response.result, { value: true }))
                })

                it('function must return false', function () {
                    return invoke(composer.task(function ({ n }) { return n % 2 === 0 }), { n: 3 }).then(activation => assert.deepEqual(activation.response.result, { value: false }))
                })

                it('function must fail', function () {
                    return invoke(composer.task(() => n)).then(() => assert.fail(), activation => assert.equal(activation.error.response.result.error, 'An error has occurred: ReferenceError: n is not defined'))
                })
            })

            describe('values', function () {
                it('true', function () {
                    return invoke(composer.value(true)).then(activation => assert.deepEqual(activation.response.result, { value: true }))
                })

                it('42', function () {
                    return invoke(composer.value(42)).then(activation => assert.deepEqual(activation.response.result, { value: 42 }))
                })
            })

            describe('invalid', function () {
                it('false must throw', function () {
                    try {
                        invoke(composer.task(false))
                        assert.fail()
                    } catch (error) {
                        assert.equal(error, 'Error: Invalid composition argument')
                    }
                })

                it('42 must throw', function () {
                    try {
                        invoke(composer.task(42))
                        assert.fail()
                    } catch (error) {
                        assert.equal(error, 'Error: Invalid composition argument')
                    }
                })

                it('{ foo: \'bar\' } must throw', function () {
                    try {
                        invoke(composer.task({ foo: 'bar' }))
                        assert.fail()
                    } catch (error) {
                        assert.equal(error, 'Error: Invalid composition argument')
                    }
                })
            })

            describe('pass', function () {
                it('pass must return input object', function () {
                    return invoke(composer.task(), { foo: 'bar' }).then(activation => assert.deepEqual(activation.response.result, { foo: 'bar' }))
                })
            })
        })

        describe('combinators', function () {
            describe('sequence', function () {
                it('flat', function () {
                    return invoke(composer.sequence('TripleAndIncrement', 'DivideByTwo', 'DivideByTwo'), { n: 5 })
                        .then(activation => assert.deepEqual(activation.response.result, { n: 4 }))
                })

                it('nested right', function () {
                    return invoke(composer.sequence('TripleAndIncrement', composer.sequence('DivideByTwo', 'DivideByTwo')), { n: 5 })
                        .then(activation => assert.deepEqual(activation.response.result, { n: 4 }))
                })

                it('nested left', function () {
                    return invoke(composer.sequence(composer.sequence('TripleAndIncrement', 'DivideByTwo'), 'DivideByTwo'), { n: 5 })
                        .then(activation => assert.deepEqual(activation.response.result, { n: 4 }))
                })

                it('seq', function () {
                    return invoke(composer.seq('TripleAndIncrement', 'DivideByTwo', 'DivideByTwo'), { n: 5 })
                        .then(activation => assert.deepEqual(activation.response.result, { n: 4 }))
                })
            })

            describe('if', function () {
                it('then branch', function () {
                    return invoke(composer.if('isEven', 'DivideByTwo', 'TripleAndIncrement'), { n: 4 })
                        .then(activation => assert.deepEqual(activation.response.result, { n: 2 }))
                })

                it('else branch', function () {
                    return invoke(composer.if('isEven', 'DivideByTwo', 'TripleAndIncrement'), { n: 3 })
                        .then(activation => assert.deepEqual(activation.response.result, { n: 10 }))
                })
            })


            describe('while', function () {
                it('test 1', function () {
                    return invoke(composer.while('isNotOne', ({ n }) => ({ n: n - 1 })), { n: 4 })
                        .then(activation => assert.deepEqual(activation.response.result, { n: 1 }))
                })

                it('test 2', function () {
                    return invoke(composer.while(() => false, ({ n }) => ({ n: n - 1 })), { n: 1 })
                        .then(activation => assert.deepEqual(activation.response.result, { n: 1 }))
                })
            })

            describe('retain', function () {
                it('test 1', function () {
                    return invoke(composer.retain('TripleAndIncrement'), { n: 3 })
                        .then(activation => assert.deepEqual(activation.response.result, { params: { n: 3 }, result: { n: 10 } }))
                })
            })

            describe('repeat', function () {
                it('test 1', function () {
                    return invoke(composer.repeat(3, 'DivideByTwo'), { n: 8 })
                        .then(activation => assert.deepEqual(activation.response.result, { n: 1 }))
                })
            })

            describe('try', function () {
                it('test 1', function () {
                    return invoke(composer.try(() => true, error => ({ message: error.error })))
                        .then(activation => assert.deepEqual(activation.response.result, { value: true }))
                })

                it('test 2', function () {
                    return invoke(composer.try(() => ({ error: 'foo' }), error => ({ message: error.error })))
                        .then(activation => assert.deepEqual(activation.response.result, { message: 'foo' }))
                })
            })

            describe('let', function () {
                it('one variable', function () {
                    return invoke(composer.let('x', 42, () => x))
                        .then(activation => assert.deepEqual(activation.response.result, { value: 42 }))
                })

                it('masking', function () {
                    return invoke(composer.let('x', 42, composer.let('x', 69, () => x)))
                        .then(activation => assert.deepEqual(activation.response.result, { value: 69 }))
                })

                it('two variables', function () {
                    return invoke(composer.let('x', 42, composer.let('y', 69, () => x + y)))
                        .then(activation => assert.deepEqual(activation.response.result, { value: 111 }))
                })

                it('scoping', function () {
                    return invoke(composer.let('x', 42, composer.let('x', 69, () => x), ({ value }) => value + x))
                        .then(activation => assert.deepEqual(activation.response.result, { value: 111 }))
                })
            })

            describe('retry', function () {
                it('test 1', function () {
                    return invoke(composer.let('x', 2, composer.retry(2, () => x-- > 0 ? { error: 'foo' } : 42)))
                        .then(activation => assert.deepEqual(activation.response.result, { value: 42 }))
                })

                it('test 2', function () {
                    return invoke(composer.let('x', 2, composer.retry(1, () => x-- > 0 ? { error: 'foo' } : 42)))
                        .then(() => assert.fail(), activation => assert.deepEqual(activation.error.response.result.error, 'foo'))
                })
            })
        })
    })

    describe('compositions', function () {
        describe('collatz', function () {
            it('composition must return { n: 1 }', function () {
                return invoke(composer.while('isNotOne', composer.if('isEven', 'DivideByTwo', 'TripleAndIncrement')), { n: 5 })
                    .then(activation => assert.deepEqual(activation.response.result, { n: 1 }))
            })
        })
    })

    describe('non-blocking invocations', function () {
        it('simple app must return session id', function () {
            return invoke(composer.task(() => 42), {}, false).then(activation => assert.ok(activation.response.result.$session))
        })

        it('complex app must return session id', function () {
            return invoke(composer.task('DivideByTwo'), {}, false).then(activation => assert.ok(activation.response.result.$session))
        })

        it('get after execution must succeed', function () {
            return invoke(composer.task('DivideByTwo'), { n: 42 }, false)
                .then(activation => new Promise(resolve => setTimeout(() => resolve(activation), 3000)))
                .then(activation => mgr.get(activation.response.result.$session))
                .then(result => assert.deepEqual(result, { n: 21 }))
        })

        it('get during execution must fail', function () {
            let session
            return invoke(composer.while('isNotOne', ({ n }) => ({ n: n - 1 })), { n: 10 }, false)
                .then(activation => mgr.get(session = activation.response.result.$session))
                .then(() => assert.fail(), result => assert.equal(result, `Cannot find result of session ${session}`))
        })

        it('kill after execution must fail', function () {
            let session
            return invoke(composer.task('DivideByTwo'), { n: 42 }, false)
                .then(activation => new Promise(resolve => setTimeout(() => resolve(activation), 3000)))
                .then(activation => mgr.kill(session = activation.response.result.$session))
                .then(() => assert.fail(), result => assert.equal(result, `Cannot find live session ${session}`))
        })

        it('kill during execution must succeed', function () {
            return invoke(composer.while('isNotOne', ({ n }) => ({ n: n - 1 })), { n: 10 }, false)
                .then(activation => mgr.kill(activation.response.result.$session))
                .then(result => assert.deepEqual(result, 'OK'))
        })

        it('purge after execution must succeed', function () {
            return invoke(composer.task('DivideByTwo'), { n: 42 }, false)
                .then(activation => new Promise(resolve => setTimeout(() => resolve(activation), 3000)))
                .then(activation => mgr.purge(activation.response.result.$session))
                .then(result => assert.deepEqual(result, 'OK'))
        })

        it('purge during execution must succeed', function () {
            return invoke(composer.while('isNotOne', ({ n }) => ({ n: n - 1 })), { n: 10 }, false)
                .then(activation => mgr.purge(activation.response.result.$session))
                .then(result => assert.deepEqual(result, 'OK'))
        })
    })
})
