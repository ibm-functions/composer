# Composition Templates

Composer makes it easy to define new composition templates. In essence, a composition template is just a composition with one or more variable arguments. In this document, we discuss key concepts of composition templates and describe a few useful templates. To use any of these templates, simply paste the template code into your composition file.

## A first example

The following composition templates invokes composition `composition` and returns the input dictionary augmented with the fields of the output dictionary, overwriting existing fields on name clashes:
```javascript
function merge(composition) {
    return composer.seq(composer.retain(composition), ({ params, result }) => Object.assign(params, result))
}
```

To instantiate a composition template, simply apply the Javascript function to concrete arguments as in:
```javascript
merge(({ n }) => ({ nPlusOne: n + 1 }))
```
For example, invoking this composition on input `{ n: 42 }` outputs `{ n: 42, nPlusOne: 43 }`.

The `composer` object itself may be extended with the new template using _monkey patching_:
```javascript
composer.merge = composition => composition.seq(composer.retain(composition), ({ params, result }) => Object.assign(params, result))
```

## On the importance of mask

Many predefined combinators are actually templates over more primitive combinators. For instance the `retain` combinator is essentially defined as follows:
```javascript
function retain(composition) {
    return composer.let(
        { params: null },
        args => { params = args },
        composer.mask(composition),
        result => ({ params, result }))
}
```

This implementation first declares a variable named `params` using `composer.let`. It then saves the input dictionary by assigning it to `params`. Next it runs `composition`. It produces the final result by combining the output dictionary (bound to `result`) with the input dictionary (bound to `params`).

It is important to notice the use of the `mask` combinator here. Since this implementation introduces a variable named `params` and invokes the parameter `composition` in the scope of the `params` variable, this variable declaration may clash with another declaration of `params` in the user code. By wrapping the `composition` invocation with `mask` we ensure that the `params` variable declared in this template is hidden from `composition`. Thanks to `mask`, the following composition correctly writes ```'Hi there!'``` to the standard output:
```javascript
composer.let({ params: 'Hi there!' }, retain(() => { console.log(params) }))
```

Because `composer` variables are dynamically scoped, without the `mask` combinator, the action log would show the value of the `params` variable declared in the template instead of the expected value.

## Pseudo parallel

The `composer` module does not support parallel execution at this time but we can fake it as follows:
```javascript
composer.par = (f, g) =>
    composer.let(
        { input: null, left: null },
        args => { input = args },
        composer.mask(f),
        args => { left = args; return input },
        composer.mask(g),
        right => ({ left, right }))
```
This code pretends to execute compositions `f` and `g` in parallel. They both receive the same input dictionary. The output dictionary for the composition has two fields: `left` carries the result of `f` and `right` carries the result of `g`. In fact the two composition are executed in sequence but `let`, `mask`, and a few Javascript function can flow the data as if running in parallel.

This implementation does not handle exceptions in `f` or `g`. This is left as an exercise to the reader.

## Apply

This `apply` combinator makes it possible to invoke a `composition` on a `field` of the input dictionary, leaving other fields unchanged.
```javascript
// example.js
composer.apply = (field, composition) =>
    composer.let(
        { field },
        composer.retain(p => p[field], composer.mask(composition)),
        p => { p.params[field] = p.result; return p.params })

composer.apply('payload', p => { p.n++ })
```

```
compose example.js --deploy example
ok: created action /_/example
```
```
wsk action invoke example -r -p payload '{"n":1,"p":42}'
{
    "payload": {
        "n": 2,
        "p": 42
    }
}
```
In this example, the `let` combinator is used to capture the desired field name: it binds the `field` variable to the field name.

## Forward

This `forward` combinator excludes the specified `fields` from the input dictionary for `composition` and restores them afterwards. It is useful for instance to hide secrets from a composition.

```javascript
composer.forward = (fields, composition) =>
    composer.let(
        { fields },
        composer.retain(p => require('lodash').omit(p, ...fields), composer.mask(composition)),
        ({ params, result }) => Object.assign(result, require('lodash').pick(params, ...fields)))

composer.forward(['user', 'password'], untrustedComposition)
```

## Inject and extract

The following combinators make it possible to bind a field of the parameter object to the value of the homonymous variable and vice versa.
```javascript
composer.inject = v => composer.seq(composer.let({ v }, params => { params[v] = eval(v) }))
composer.extract = v => composer.seq(composer.let({ v }, params => { eval(`${v} = params[v]`); delete params[v] }))

composer.let({ token: null }, 'getSecretToken', composer.extract('token'), untrustedAction, composer.inject('token'), trustedAction)
```
