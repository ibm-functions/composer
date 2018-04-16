const assert = require('assert')
const composer = require('../composer')
const name = 'TestAction'
const wsk = composer.openwhisk({ ignore_certs: process.env.IGNORE_CERTS && process.env.IGNORE_CERTS !== 'false' && process.env.IGNORE_CERTS !== '0' })

// deploy action
const define = action => wsk.actions.delete(action.name).catch(() => { }).then(() => wsk.actions.create(action))

// deploy and invoke composition
const invoke = (task, params = {}, blocking = true) => wsk.compositions.deploy(composer.composition(name, task)).then(() => wsk.actions.invoke({ name, params, blocking }))

describe('composer', function () {
    this.timeout(60000)

    before('deploy test actions', function () {
        return define({ name: 'echo', action: 'const main = x=>x' })
            .then(() => define({ name: 'DivideByTwo', action: 'function main({n}) { return { n: n / 2 } }' }))
            .then(() => define({ name: 'TripleAndIncrement', action: 'function main({n}) { return { n: n * 3 + 1 } }' }))
            .then(() => define({ name: 'isNotOne', action: 'function main({n}) { return { value: n != 1 } }' }))
            .then(() => define({ name: 'isEven', action: 'function main({n}) { return { value: n % 2 == 0 } }' }))
    })


    describe('blocking invocations', function () {
        describe('actions', function () {
            it('action must return true', function () {
                return invoke(composer.action('isNotOne'), { n: 0 }).then(activation => assert.deepEqual(activation.response.result, { value: true }))
            })

            it('action must return false', function () {
                return invoke(composer.action('isNotOne'), { n: 1 }).then(activation => assert.deepEqual(activation.response.result, { value: false }))
            })

            it('action name must parse to fully qualified', function () {
                let combos = [
                    { n: '', s: false, e: 'Name is not specified' },
                    { n: ' ', s: false, e: 'Name is not specified' },
                    { n: '/', s: false, e: 'Name is not valid' },
                    { n: '//', s: false, e: 'Name is not valid' },
                    { n: '/a', s: false, e: 'Name is not valid' },
                    { n: '/a/b/c/d', s: false, e: 'Name is not valid' },
                    { n: '/a/b/c/d/', s: false, e: 'Name is not valid' },
                    { n: 'a/b/c/d', s: false, e: 'Name is not valid' },
                    { n: '/a/ /b', s: false, e: 'Name is not valid' },
                    { n: 'a', e: false, s: '/_/a' },
                    { n: 'a/b', e: false, s: '/_/a/b' },
                    { n: 'a/b/c', e: false, s: '/a/b/c' },
                    { n: '/a/b', e: false, s: '/a/b' },
                    { n: '/a/b/c', e: false, s: '/a/b/c' }
                ]
                combos.forEach(({ n, s, e }) => {
                    if (s) {
                        // good cases
                        assert.ok(composer.action(n).name, s)
                    } else {
                        // error cases
                        try {
                            composer.action(n)
                            assert.fail()
                        } catch (error) {
                            assert.ok(error.message == e)
                        }
                    }
                })
            })

            it('invalid argument', function () {
                try {
                    invoke(composer.function(42))
                    assert.fail()
                } catch (error) {
                    assert.ok(error.message.startsWith('Invalid argument'))
                }
            })

            it('too many arguments', function () {
                try {
                    invoke(composer.function('foo', 'foo'))
                    assert.fail()
                } catch (error) {
                    assert.ok(error.message.startsWith('Too many arguments'))
                }
            })
        })

        describe('literals', function () {
            it('true', function () {
                return invoke(composer.literal(true)).then(activation => assert.deepEqual(activation.response.result, { value: true }))
            })

            it('42', function () {
                return invoke(composer.literal(42)).then(activation => assert.deepEqual(activation.response.result, { value: 42 }))
            })

            it('invalid argument', function () {
                try {
                    invoke(composer.literal(invoke))
                    assert.fail()
                } catch (error) {
                    assert.ok(error.message.startsWith('Invalid argument'))
                }
            })

            it('too many arguments', function () {
                try {
                    invoke(composer.literal('foo', 'foo'))
                    assert.fail()
                } catch (error) {
                    assert.ok(error.message.startsWith('Too many arguments'))
                }
            })
        })

        describe('functions', function () {
            it('function must return true', function () {
                return invoke(composer.function(({ n }) => n % 2 === 0), { n: 4 }).then(activation => assert.deepEqual(activation.response.result, { value: true }))
            })

            it('function must return false', function () {
                return invoke(composer.function(function ({ n }) { return n % 2 === 0 }), { n: 3 }).then(activation => assert.deepEqual(activation.response.result, { value: false }))
            })

            it('function must fail', function () {
                return invoke(composer.function(() => n)).then(() => assert.fail(), activation => assert.ok(activation.error.response.result.error.startsWith('An exception was caught')))
            })

            it('function must throw', function () {
                return invoke(composer.function(() => ({ error: 'foo', n: 42 }))).then(() => assert.fail(), activation => assert.deepEqual(activation.error.response.result, { error: 'foo' }))
            })

            it('function must mutate params', function () {
                return invoke(composer.function(params => { params.foo = 'foo' }), { n: 42 }).then(activation => assert.deepEqual(activation.response.result, { foo: 'foo', n: 42 }))
            })

            it('function as string', function () {
                return invoke(composer.function('({ n }) => n % 2 === 0'), { n: 4 }).then(activation => assert.deepEqual(activation.response.result, { value: true }))
            })

            it('invalid argument', function () {
                try {
                    invoke(composer.function(42))
                    assert.fail()
                } catch (error) {
                    assert.ok(error.message.startsWith('Invalid argument'))
                }
            })

            it('too many arguments', function () {
                try {
                    invoke(composer.function(() => n, () => { }))
                    assert.fail()
                } catch (error) {
                    assert.ok(error.message.startsWith('Too many arguments'))
                }
            })
        })

        describe('deserialize', function () {
            it('should deserialize a serialized composition', function () {
                const json = {
                    "type": "sequence",
                    "components": [{
                        "type": "action",
                        "name": "echo"
                    }, {
                        "type": "action",
                        "name": "echo"
                    }]
                }
                return invoke(composer.deserialize(json), { message: 'hi' }).then(activation => assert.deepEqual(activation.response.result, { message: 'hi' }))
            })
        })

        describe('tasks', function () {
            describe('action tasks', function () {
                it('action must return true', function () {
                    return invoke(composer.task('isNotOne'), { n: 0 }).then(activation => assert.deepEqual(activation.response.result, { value: true }))
                })
            })

            describe('function tasks', function () {
                it('function must return true', function () {
                    return invoke(composer.task(({ n }) => n % 2 === 0), { n: 4 }).then(activation => assert.deepEqual(activation.response.result, { value: true }))
                })
            })

            describe('null task', function () {
                it('null task must return input', function () {
                    return invoke(composer.task(null), { foo: 'foo' }).then(activation => assert.deepEqual(activation.response.result, { foo: 'foo' }))
                })

                it('null task must fail on error input', function () {
                    return invoke(composer.task(null), { error: 'foo' }).then(() => assert.fail(), activation => assert.deepEqual(activation.error.response.result, { error: 'foo' }))
                })
            })

            describe('invalid tasks', function () {
                it('a Boolean is not a valid task', function () {
                    try {
                        invoke(composer.task(false))
                        assert.fail()
                    } catch (error) {
                        assert.ok(error.message.startsWith('Invalid argument'))
                    }
                })

                it('a number is not a valid task', function () {
                    try {
                        invoke(composer.task(42))
                        assert.fail()
                    } catch (error) {
                        assert.ok(error.message.startsWith('Invalid argument'))
                    }
                })

                it('a dictionary is not a valid task', function () {
                    try {
                        invoke(composer.task({ foo: 'foo' }))
                        assert.fail()
                    } catch (error) {
                        assert.ok(error.message.startsWith('Invalid argument'))
                    }
                })
            })

            it('too many arguments', function () {
                try {
                    invoke(composer.task('foo', 'foo'))
                    assert.fail()
                } catch (error) {
                    assert.ok(error.message.startsWith('Too many arguments'))
                }
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
                it('condition = true', function () {
                    return invoke(composer.if('isEven', 'DivideByTwo', 'TripleAndIncrement'), { n: 4 })
                        .then(activation => assert.deepEqual(activation.response.result, { n: 2 }))
                })

                it('condition = false', function () {
                    return invoke(composer.if('isEven', 'DivideByTwo', 'TripleAndIncrement'), { n: 3 })
                        .then(activation => assert.deepEqual(activation.response.result, { n: 10 }))
                })

                it('condition = true, then branch only', function () {
                    return invoke(composer.if('isEven', 'DivideByTwo'), { n: 4 })
                        .then(activation => assert.deepEqual(activation.response.result, { n: 2 }))
                })

                it('condition = false, then branch only', function () {
                    return invoke(composer.if('isEven', 'DivideByTwo'), { n: 3 })
                        .then(activation => assert.deepEqual(activation.response.result, { n: 3 }))
                })

                it('condition = true, nosave option', function () {
                    return invoke(composer.if_nosave('isEven', params => { params.then = true }, params => { params.else = true }), { n: 2 })
                        .then(activation => assert.deepEqual(activation.response.result, { value: true, then: true }))
                })

                it('condition = false, nosave option', function () {
                    return invoke(composer.if_nosave('isEven', params => { params.then = true }, params => { params.else = true }), { n: 3 })
                        .then(activation => assert.deepEqual(activation.response.result, { value: false, else: true }))
                })

                it('too many arguments', function () {
                    try {
                        invoke(composer.if('isEven', 'DivideByTwo', 'TripleAndIncrement', 'TripleAndIncrement'))
                        assert.fail()
                    } catch (error) {
                        assert.ok(error.message.startsWith('Too many arguments'))
                    }
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

                it('nosave option', function () {
                    return invoke(composer.while_nosave(({ n }) => ({ n, value: n !== 1 }), ({ n }) => ({ n: n - 1 })), { n: 4 })
                        .then(activation => assert.deepEqual(activation.response.result, { value: false, n: 1 }))
                })

                it('too many arguments', function () {
                    try {
                        invoke(composer.while('isNotOne', ({ n }) => ({ n: n - 1 }), ({ n }) => ({ n: n - 1 })), { n: 4 })
                        assert.fail()
                    } catch (error) {
                        assert.ok(error.message.startsWith('Too many arguments'))
                    }
                })
            })

            describe('dowhile', function () {
                it('a few iterations', function () {
                    return invoke(composer.dowhile(({ n }) => ({ n: n - 1 }), 'isNotOne'), { n: 4 })
                        .then(activation => assert.deepEqual(activation.response.result, { n: 1 }))
                })

                it('one iteration', function () {
                    return invoke(composer.dowhile(({ n }) => ({ n: n - 1 }), () => false), { n: 1 })
                        .then(activation => assert.deepEqual(activation.response.result, { n: 0 }))
                })

                it('nosave option', function () {
                    return invoke(composer.dowhile_nosave(({ n }) => ({ n: n - 1 }), ({ n }) => ({ n, value: n !== 1 })), { n: 4 })
                        .then(activation => assert.deepEqual(activation.response.result, { value: false, n: 1 }))
                })

                it('too many arguments', function () {
                    try {
                        invoke(composer.dowhile(({ n }) => ({ n: n - 1 }), 'isNotOne', ({ n }) => ({ n: n - 1 })), { n: 4 })
                        assert.fail()
                    } catch (error) {
                        assert.ok(error.message.startsWith('Too many arguments'))
                    }
                })
            })

            describe('try', function () {
                it('no error', function () {
                    return invoke(composer.try(() => true, error => ({ message: error.error })))
                        .then(activation => assert.deepEqual(activation.response.result, { value: true }))
                })

                it('error', function () {
                    return invoke(composer.try(() => ({ error: 'foo' }), error => ({ message: error.error })))
                        .then(activation => assert.deepEqual(activation.response.result, { message: 'foo' }))
                })

                it('try must throw', function () {
                    return invoke(composer.try(composer.task(null), error => ({ message: error.error })), { error: 'foo' })
                        .then(activation => assert.deepEqual(activation.response.result, { message: 'foo' }))
                })

                it('while must throw', function () {
                    return invoke(composer.try(composer.while(composer.literal(false), null), error => ({ message: error.error })), { error: 'foo' })
                        .then(activation => assert.deepEqual(activation.response.result, { message: 'foo' }))
                })

                it('if must throw', function () {
                    return invoke(composer.try(composer.if(composer.literal(false), null), error => ({ message: error.error })), { error: 'foo' })
                        .then(activation => assert.deepEqual(activation.response.result, { message: 'foo' }))
                })

                it('retain', function () {
                    return invoke(composer.retain(composer.try(() => ({ p: 4 }), null)), { n: 3 })
                        .then(activation => assert.deepEqual(activation.response.result, { params: { n: 3 }, result: { p: 4 } }))
                })

                it('too many arguments', function () {
                    try {
                        invoke(composer.try('isNotOne', 'isNotOne', 'isNotOne'))
                        assert.fail()
                    } catch (error) {
                        assert.ok(error.message.startsWith('Too many arguments'))
                    }
                })
            })

            describe('finally', function () {
                it('no error', function () {
                    return invoke(composer.finally(() => true, params => ({ params })))
                        .then(activation => assert.deepEqual(activation.response.result, { params: { value: true } }))
                })

                it('error', function () {
                    return invoke(composer.finally(() => ({ error: 'foo' }), params => ({ params })))
                        .then(activation => assert.deepEqual(activation.response.result, { params: { error: 'foo' } }))
                })

                it('too many arguments', function () {
                    try {
                        invoke(composer.finally('isNotOne', 'isNotOne', 'isNotOne'))
                        assert.fail()
                    } catch (error) {
                        assert.ok(error.message.startsWith('Too many arguments'))
                    }
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

                it('invalid argument', function () {
                    try {
                        invoke(composer.let(invoke))
                        assert.fail()
                    } catch (error) {
                        assert.ok(error.message.startsWith('Invalid argument'))
                    }
                })
            })

            describe('mask', function () {
                it('let/let/mask', function () {
                    return invoke(composer.let({ x: 42 }, composer.let({ x: 69 }, composer.mask(() => x))))
                        .then(activation => assert.deepEqual(activation.response.result, { value: 42 }))
                })

                it('let/mask/let', function () {
                    return invoke(composer.let({ x: 42 }, composer.mask(composer.let({ x: 69 }, () => x))))
                        .then(activation => assert.deepEqual(activation.response.result, { value: 69 }))
                })

                it('let/let/try/mask', function () {
                    return invoke(composer.let({ x: 42 }, composer.let({ x: 69 },
                        composer.try(composer.mask(() => x), () => { }))))
                        .then(activation => assert.deepEqual(activation.response.result, { value: 42 }))
                })

                it('let/let/let/mask', function () {
                    return invoke(composer.let({ x: 42 }, composer.let({ x: 69 },
                        composer.let({ x: -1 }, composer.mask(() => x)))))
                        .then(activation => assert.deepEqual(activation.response.result, { value: 69 }))
                })

                it('let/let/let/mask/mask', function () {
                    return invoke(composer.let({ x: 42 }, composer.let({ x: 69 },
                        composer.let({ x: -1 }, composer.mask(composer.mask(() => x))))))
                        .then(activation => assert.deepEqual(activation.response.result, { value: 42 }))
                })

                it('let/let/mask/let/mask', function () {
                    return invoke(composer.let({ x: 42 }, composer.let({ x: 69 },
                        composer.mask(composer.let({ x: -1 }, composer.mask(() => x))))))
                        .then(activation => assert.deepEqual(activation.response.result, { value: 42 }))
                })
            })

            describe('retain', function () {
                it('base case', function () {
                    return invoke(composer.retain('TripleAndIncrement'), { n: 3 })
                        .then(activation => assert.deepEqual(activation.response.result, { params: { n: 3 }, result: { n: 10 } }))
                })

                it('throw error', function () {
                    return invoke(composer.retain(() => ({ error: 'foo' })), { n: 3 })
                        .then(() => assert.fail(), activation => assert.deepEqual(activation.error.response.result, { error: 'foo' }))
                })

                it('catch error', function () {
                    return invoke(composer.retain_catch(() => ({ error: 'foo' })), { n: 3 })
                        .then(activation => assert.deepEqual(activation.response.result, { params: { n: 3 }, result: { error: 'foo' } }))
                })
            })

            describe('repeat', function () {
                it('a few iterations', function () {
                    return invoke(composer.repeat(3, 'DivideByTwo'), { n: 8 })
                        .then(activation => assert.deepEqual(activation.response.result, { n: 1 }))
                })

                it('invalid argument', function () {
                    try {
                        invoke(composer.repeat('foo'))
                        assert.fail()
                    } catch (error) {
                        assert.ok(error.message.startsWith('Invalid argument'))
                    }
                })
            })

            describe('retry', function () {
                it('success', function () {
                    return invoke(composer.let({ x: 2 }, composer.retry(2, () => x-- > 0 ? { error: 'foo' } : 42)))
                        .then(activation => assert.deepEqual(activation.response.result, { value: 42 }))
                })

                it('failure', function () {
                    return invoke(composer.let({ x: 2 }, composer.retry(1, () => x-- > 0 ? { error: 'foo' } : 42)))
                        .then(() => assert.fail(), activation => assert.deepEqual(activation.error.response.result.error, 'foo'))

                })

                it('invalid argument', function () {
                    try {
                        invoke(composer.retry('foo'))
                        assert.fail()
                    } catch (error) {
                        assert.ok(error.message.startsWith('Invalid argument'))
                    }
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
