const assert = require('assert')
const composer = require('../composer')()
const name = 'TestAction'

// compile, deploy, and blocking invoke
const invoke = (task, params = {}, blocking = true) => task.named(name).deploy().then(() => composer.wsk.actions.invoke({ name, params, blocking }))

describe('composer', function () {
    this.timeout(20000)

    before('deploy test actions', function () {
        return Promise.all([
            composer.action('DivideByTwo', { action: 'function main({n}) { return { n: n / 2 } }' }).deploy(),
            composer.action('TripleAndIncrement', { action: 'function main({n}) { return { n: n * 3 + 1 } }' }).deploy(),
            composer.action('isNotOne', { action: 'function main({n}) { return { value: n != 1 } }' }).deploy(),
            composer.action('isEven', { action: 'function main({n}) { return { value: n % 2 == 0 } }' }).deploy()])
    })

    describe('blocking invocations', function () {
        describe('actions', function () {
            it('action must return true', function () {
                return invoke(composer.action('isNotOne'), { n: 0 }).then(activation => assert.deepEqual(activation.response.result, { value: true }))
            })

            it('action must return false', function () {
                return invoke(composer.action('isNotOne'), { n: 1 }).then(activation => assert.deepEqual(activation.response.result, { value: false }))
            })

            it('action name must parse to fully qualified', function() {
                let combos = [
                     { n: '',          s: false, e: 'Name is not specified' },
                     { n: ' ',         s: false, e: 'Name is not specified' },
                     { n: '/',         s: false, e: 'Name is not valid' },
                     { n: '//',        s: false, e: 'Name is not valid' },
                     { n: '/a',        s: false, e: 'Name is not valid' },
                     { n: '/a/b/c/d',  s: false, e: 'Name is not valid' },
                     { n: '/a/b/c/d/', s: false, e: 'Name is not valid' },
                     { n: 'a/b/c/d',   s: false, e: 'Name is not valid' },
                     { n: '/a/ /b',    s: false, e: 'Name is not valid' },
                     { n: 'a',         e: false, s: '/_/a' },
                     { n: 'a/b',       e: false, s: '/_/a/b' },
                     { n: 'a/b/c',     e: false, s: '/a/b/c' },
                     { n: '/a/b',      e: false, s: '/a/b' },
                     { n: '/a/b/c',    e: false, s: '/a/b/c' }
                ]
                combos.forEach(({n, s, e}) => {
                     if (s) {
                         // good cases
                         assert.ok(composer.action(n).composition[0].name, s)
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

            it('invalid options', function () {
                try {
                    invoke(composer.function('foo', 'bar'))
                    assert.fail()
                } catch (error) {
                    assert.ok(error.message.startsWith('Invalid options'))
                }
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
                    invoke(composer.function('foo', {}, 'bar'))
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

            it('invalid options', function () {
                try {
                    invoke(composer.literal('foo', 'bar'))
                    assert.fail()
                } catch (error) {
                    assert.ok(error.message.startsWith('Invalid options'))
                }
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
                    invoke(composer.literal('foo', {}, 'bar'))
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
                return invoke(composer.function(params => { params.foo = 'foo' }), { bar: 42 }).then(activation => assert.deepEqual(activation.response.result, { foo: 'foo', bar: 42 }))
            })

            it('function as string', function () {
                return invoke(composer.function('({ n }) => n % 2 === 0'), { n: 4 }).then(activation => assert.deepEqual(activation.response.result, { value: true }))
            })

            it('invalid options', function () {
                try {
                    invoke(composer.function(() => n, 'foo'))
                    assert.fail()
                } catch (error) {
                    assert.ok(error.message.startsWith('Invalid options'))
                }
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
                    invoke(composer.function(() => n, {}, () => { }))
                    assert.fail()
                } catch (error) {
                    assert.ok(error.message.startsWith('Too many arguments'))
                }
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
                    return invoke(composer.task(), { foo: 'bar' }).then(activation => assert.deepEqual(activation.response.result, { foo: 'bar' }))
                })

                it('null task must fail on error input', function () {
                    return invoke(composer.task(), { error: 'bar' }).then(() => assert.fail(), activation => assert.deepEqual(activation.error.response.result, { error: 'bar' }))
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
                        invoke(composer.task({ foo: 'bar' }))
                        assert.fail()
                    } catch (error) {
                        assert.ok(error.message.startsWith('Invalid argument'))
                    }
                })
            })

            it('too many arguments', function () {
                try {
                    invoke(composer.task('foo', 'bar'))
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
                    return invoke(composer.if('isEven', params => { params.then = true }, params => { params.else = true }, { nosave: true }), { n: 2 })
                        .then(activation => assert.deepEqual(activation.response.result, { value: true, then: true }))
                })

                it('condition = false, nosave option', function () {
                    return invoke(composer.if('isEven', params => { params.then = true }, params => { params.else = true }, { nosave: true }), { n: 3 })
                        .then(activation => assert.deepEqual(activation.response.result, { value: false, else: true }))
                })

                it('invalid options', function () {
                    try {
                        invoke(composer.if('isEven', 'DivideByTwo', 'TripleAndIncrement', 'TripleAndIncrement'))
                        assert.fail()
                    } catch (error) {
                        assert.ok(error.message.startsWith('Invalid options'))
                    }
                })

                it('too many arguments', function () {
                    try {
                        invoke(composer.if('isEven', 'DivideByTwo', 'TripleAndIncrement', {}, 'TripleAndIncrement'))
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
                    return invoke(composer.while(({ n }) => ({ n, value: n !== 1 }), ({ n }) => ({ n: n - 1 }), { nosave: true }), { n: 4 })
                        .then(activation => assert.deepEqual(activation.response.result, { value: false, n: 1 }))
                })

                it('invalid options', function () {
                    try {
                        invoke(composer.while('isNotOne', ({ n }) => ({ n: n - 1 }), ({ n }) => ({ n: n - 1 })), { n: 4 })
                        assert.fail()
                    } catch (error) {
                        assert.ok(error.message.startsWith('Invalid options'))
                    }
                })

                it('too many arguments', function () {
                    try {
                        invoke(composer.while('isNotOne', ({ n }) => ({ n: n - 1 }), {}, ({ n }) => ({ n: n - 1 })), { n: 4 })
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
                    return invoke(composer.dowhile(({ n }) => ({ n: n - 1 }), ({ n }) => ({ n, value: n !== 1 }), { nosave: true }), { n: 4 })
                        .then(activation => assert.deepEqual(activation.response.result, { value: false, n: 1 }))
                })

                it('invalid options', function () {
                    try {
                        invoke(composer.dowhile(({ n }) => ({ n: n - 1 }), 'isNotOne', ({ n }) => ({ n: n - 1 })), { n: 4 })
                        assert.fail()
                    } catch (error) {
                        assert.ok(error.message.startsWith('Invalid options'))
                    }
                })

                it('too many arguments', function () {
                    try {
                        invoke(composer.dowhile(({ n }) => ({ n: n - 1 }), 'isNotOne', {}, ({ n }) => ({ n: n - 1 })), { n: 4 })
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
                    return invoke(composer.try(composer.try(), error => ({ message: error.error })), { error: 'foo' })
                        .then(activation => assert.deepEqual(activation.response.result, { message: 'foo' }))
                })

                it('while must throw', function () {
                    return invoke(composer.try(composer.while(composer.literal(false)), error => ({ message: error.error })), { error: 'foo' })
                        .then(activation => assert.deepEqual(activation.response.result, { message: 'foo' }))
                })

                it('if must throw', function () {
                    return invoke(composer.try(composer.if(composer.literal(false)), error => ({ message: error.error })), { error: 'foo' })
                        .then(activation => assert.deepEqual(activation.response.result, { message: 'foo' }))
                })

                it('invalid options', function () {
                    try {
                        invoke(composer.try('isNotOne', 'isNotOne', 'isNotOne'))
                        assert.fail()
                    } catch (error) {
                        assert.ok(error.message.startsWith('Invalid options'))
                    }
                })

                it('too many arguments', function () {
                    try {
                        invoke(composer.try('isNotOne', 'isNotOne', {}, 'isNotOne'))
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

                it('invalid options', function () {
                    try {
                        invoke(composer.finally('isNotOne', 'isNotOne', 'isNotOne'))
                        assert.fail()
                    } catch (error) {
                        assert.ok(error.message.startsWith('Invalid options'))
                    }
                })

                it('too many arguments', function () {
                    try {
                        invoke(composer.finally('isNotOne', 'isNotOne', {}, 'isNotOne'))
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
                    return invoke(composer.retain(() => ({ error: 'foo' }), { catch: true }), { n: 3 })
                        .then(activation => assert.deepEqual(activation.response.result, { params: { n: 3 }, result: { error: 'foo' } }))
                })

                it('select field', function () {
                    return invoke(composer.retain('TripleAndIncrement', { field: 'p' }), { n: 3, p: 4 })
                        .then(activation => assert.deepEqual(activation.response.result, { params: 4, result: { n: 10 } }))
                })

                it('select field, throw error', function () {
                    return invoke(composer.retain(() => ({ error: 'foo' }), { field: 'p' }), { n: 3, p: 4 })
                        .then(() => assert.fail(), activation => assert.deepEqual(activation.error.response.result, { error: 'foo' }))
                })

                it('select field, catch error', function () {
                    return invoke(composer.retain(() => ({ error: 'foo' }), { field: 'p', catch: true }), { n: 3, p: 4 })
                        .then(activation => assert.deepEqual(activation.response.result, { params: 4, result: { error: 'foo' } }))
                })

                it('filter function', function () {
                    return invoke(composer.retain('TripleAndIncrement', { filter: ({ n }) => ({ n: -n }) }), { n: 3 })
                        .then(activation => assert.deepEqual(activation.response.result, { params: { n: -3 }, result: { n: 10 } }))
                })

                it('filter function, throw error', function () {
                    return invoke(composer.retain(() => ({ error: 'foo' }), { filter: ({ n }) => ({ n: -n }) }), { n: 3 })
                        .then(() => assert.fail(), activation => assert.deepEqual(activation.error.response.result, { error: 'foo' }))
                })

                it('filter function, catch error', function () {
                    return invoke(composer.retain(() => ({ error: 'foo' }), { filter: ({ n }) => ({ n: -n }), catch: true }), { n: 3 })
                        .then(activation => assert.deepEqual(activation.response.result, { params: { n: - 3 }, result: { error: 'foo' } }))
                })

                it('invalid options', function () {
                    try {
                        invoke(composer.retain('isNotOne', 'isNotOne'))
                        assert.fail()
                    } catch (error) {
                        assert.ok(error.message.startsWith('Invalid options'))
                    }
                })

                it('too many arguments', function () {
                    try {
                        invoke(composer.retain('isNotOne', {}, 'isNotOne'))
                        assert.fail()
                    } catch (error) {
                        assert.ok(error.message.startsWith('Too many arguments'))
                    }
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
