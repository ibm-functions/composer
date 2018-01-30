const assert = require('assert')
const composer = require('../composer')
const name = 'composer-test-action'

const invoke = (task, params = {}, blocking = true) => composer.deploy(composer.compile(name, task)).then(() => composer.wsk.actions.invoke({ name, params, blocking }))

describe('composer', function () {
    this.timeout(20000)

    before('deploy conductor and sample actions', function () {
        return composer.deploy(
            [{ name: 'DivideByTwo', action: 'function main({n}) { return { n: n / 2 } }' },
            { name: 'TripleAndIncrement', action: 'function main({n}) { return { n: n * 3 + 1 } }' },
            { name: 'isNotOne', action: 'function main({n}) { return { value: n != 1 } }' },
            { name: 'isEven', action: 'function main({n}) { return { value: n % 2  == 0 } }' }])
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
                    return invoke(composer.task(() => n)).then(() => assert.fail(), activation => assert.ok(activation.error.response.result.error.startsWith('An exception was caught at state')))
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
                        assert.equal(error, 'Error: Invalid argument')
                    }
                })

                it('42 must throw', function () {
                    try {
                        invoke(composer.task(42))
                        assert.fail()
                    } catch (error) {
                        assert.equal(error, 'Error: Invalid argument')
                    }
                })

                it('{ foo: \'bar\' } must throw', function () {
                    try {
                        invoke(composer.task({ foo: 'bar' }))
                        assert.fail()
                    } catch (error) {
                        assert.equal(error, 'Error: Invalid argument')
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
                it('then branch no else branch', function () {
                    return invoke(composer.if('isEven', 'DivideByTwo'), { n: 4 })
                        .then(activation => assert.deepEqual(activation.response.result, { n: 2 }))
                })

                it('no else branch', function () {
                    return invoke(composer.if('isEven', 'DivideByTwo'), { n: 3 })
                        .then(activation => assert.deepEqual(activation.response.result, { n: 3 }))
                })

                it('then branch', function () {
                    return invoke(composer.if('isEven', 'DivideByTwo', 'TripleAndIncrement'), { n: 4 })
                        .then(activation => assert.deepEqual(activation.response.result, { n: 2 }))
                })

                it('else branch', function () {
                    return invoke(composer.if('isEven', 'DivideByTwo', 'TripleAndIncrement'), { n: 3 })
                        .then(activation => assert.deepEqual(activation.response.result, { n: 10 }))
                })

                it('then branch no retain', function () {
                    return invoke(composer.if('isEven', params => { params.then = true }, params => { params.else = true }, true), { n: 2 })
                        .then(activation => assert.deepEqual(activation.response.result, { value: true, then: true }))
                })

                it('else branch no retain', function () {
                    return invoke(composer.if('isEven', params => { params.then = true }, params => { params.else = true }, true), { n: 3 })
                        .then(activation => assert.deepEqual(activation.response.result, { value: false, else: true }))
                })
            })

            describe('while', function () {
                it('a few iterations', function () {
                    return invoke(composer.while('isNotOne', ({ n }) => ({ n: n - 1 })), { n: 4 })
                        .then(activation => assert.deepEqual(activation.response.result, { n: 1 }))
                })

                it('no iteration', function () {
                    return invoke(composer.while(() => false, ({ n }) => ({ n: n - 1 })), { n: 1 })
                        .then(activation => assert.deepEqual(activation.response.result, { n: 1 }))
                })

                it('no retain', function () {
                    return invoke(composer.while(({ n }) => ({ n, value: n !== 1 }), ({ n }) => ({ n: n - 1 }), true), { n: 4 })
                        .then(activation => assert.deepEqual(activation.response.result, { value: false, n: 1 }))
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

            describe('finally', function () {
                it('test 1', function () {
                    return invoke(composer.finally(() => true, params => ({ params })))
                        .then(activation => assert.deepEqual(activation.response.result, { params: { value: true } }))
                })

                it('test 2', function () {
                    return invoke(composer.finally(() => ({ error: 'foo' }), params => ({ params })))
                        .then(activation => assert.deepEqual(activation.response.result, { params: { error: 'foo' } }))
                })
            })

            describe('let', function () {
                it('one variable', function () {
                    return invoke(composer.let({ x: 42 }, () => x))
                        .then(activation => assert.deepEqual(activation.response.result, { value: 42 }))
                })

                it('masking', function () {
                    return invoke(composer.let({ x: 42 }, composer.let({ x: 69 }, () => x)))
                        .then(activation => assert.deepEqual(activation.response.result, { value: 69 }))
                })

                it('two variables', function () {
                    return invoke(composer.let({ x: 42 }, composer.let({ y: 69 }, () => x + y)))
                        .then(activation => assert.deepEqual(activation.response.result, { value: 111 }))
                })

                it('two variables combined', function () {
                    return invoke(composer.let({ x: 42, y: 69 }, () => x + y))
                        .then(activation => assert.deepEqual(activation.response.result, { value: 111 }))
                })

                it('scoping', function () {
                    return invoke(composer.let({ x: 42 }, composer.let({ x: 69 }, () => x), ({ value }) => value + x))
                        .then(activation => assert.deepEqual(activation.response.result, { value: 111 }))
                })
            })

            describe('retain', function () {
                it('test 1', function () {
                    return invoke(composer.retain('TripleAndIncrement'), { n: 3 })
                        .then(activation => assert.deepEqual(activation.response.result, { params: { n: 3 }, result: { n: 10 } }))
                })

                it('test 2', function () {
                    return invoke(composer.retain('TripleAndIncrement', true), { n: 3 })
                        .then(activation => assert.deepEqual(activation.response.result, { params: { n: 3 }, result: { n: 10 } }))
                })
                it('test 3', function () {
                    return invoke(composer.retain('TripleAndIncrement', ({ n }) => ({ n: -n })), { n: 3 })
                        .then(activation => assert.deepEqual(activation.response.result, { params: { n: -3 }, result: { n: 10 } }))
                })
            })

            describe('repeat', function () {
                it('test 1', function () {
                    return invoke(composer.repeat(3, 'DivideByTwo'), { n: 8 })
                        .then(activation => assert.deepEqual(activation.response.result, { n: 1 }))
                })
            })

            describe('retry', function () {
                it('test 1', function () {
                    return invoke(composer.let({ x: 2 }, composer.retry(2, () => x-- > 0 ? { error: 'foo' } : 42)))
                        .then(activation => assert.deepEqual(activation.response.result, { value: 42 }))
                })

                it('test 2', function () {
                    return invoke(composer.let({ x: 2 }, composer.retry(1, () => x-- > 0 ? { error: 'foo' } : 42)))
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
})
