# Introduction to Serverless Composition

Composer is an [IBM Cloud Functions](https://ibm.biz/openwhisk)
programming model for composing individual functions into larger
applications. Compositions, informally named _apps_, run in the cloud
using automatically managed compute and memory resources. Composer is
an extension of the function-as-a-service computing model, and enables
stateful computation, control flow, and rich patterns of data flow.

Composer has two parts. The first is a library for describing
compositions, programmatically. The library is currently available in
Node.js. The second is a runtime that executes the composition. We
will explain these components in greater detail, but first, we will
introduce you to the programming environment for compositions.

Programming for the serverless cloud is a uniquely new experience. For
this reason, we have developed a unified environment that offers the
benefits and familiarity of a command line interface, with
visualization and a graphical interface to assist in certain
tasks. This environment is offered through a new tool called `fsh`:
_the functions programming shell for the IBM Cloud_.

- [Programming shell quick start](#programming-shell-quick-start)
  - [Installing the shell](#installing-the-shell)
  - [Tour of the command line tool](#tour-of-the-programming-shell)
  - [Getting setup to run compositions](#before-you-run-your-first-app)

- Your first composition
  - [Create a composition](#your-first-composition)
  - [Preview your composition](#previewing-a-composition)
  - [Deploy and run](#running-your-first-app)
  - [Visualize an execution](#visualizing-sessions)
  - [Composing OpenWhisk actions](#composing-openwhisk-actions)

- [Compositions by example](#compositions-by-example)
  - [if-then-else](#if-combinator)
  - [try-catch](#try-combinator)
  - [data forwarding](#nesting-and-forwarding)
  - [scoped variables](#variables-and-scoping)

- The Composer programming model
  - [The composition library](COMPOSER.md)
  - [The underlying composition model](FORMAT.md)
  - [The execution model](CONDUCTOR.md)

## Programming shell quick start

The programming shell for functions and compositions is a new
developer experience with fluid migration between a conventional
command line tool and a graphical interface. It is also the
environment for developing and working with serverless compositions.

### Installing the shell

The programming shell is currently distributed through the [Node
package manager](https://www.npmjs.com/package/@ibm-functions/shell).

```bash
$ npm install -g @ibm-functions/shell
```

We roll out frequent updates and bug fixes. You can check for new
releases via `fsh version -u`.

```
$ fsh version -u
You are currently on version 1.3.219
Checking for updates... you are up to date!
```

We recommend updating the shell via the same `npm install` command
shown earlier.  Refer to [`npm` troubleshooting](npm.md) if your
installation fails.

### Tour of the programming shell

At the end of the installation, you can run the programming shell form your terminal. It is
typically installed in `/usr/local/bin/fsh`.

```
$ fsh
Welcome to the IBM Cloud Functions Shell

Usage information:
fsh about                                    [ Display version information ]
fsh help                                     [ Show more detailed help, with tutorials ]
fsh shell                                    [ Open graphical shell ]
fsh run <script.fsh>                         [ Execute commands from a file ]

fsh app init                                 [ Initialize state management ]
fsh app preview <file.js|file.json>          [ Prototype a composition, with visualization help ]
fsh app list                                 [ List deployed compositions ]
fsh app create <name> <file.js|file.json>    [ Deploy a composition ]
fsh app update <name> <file.js|file.json>    [ Update or deploy composition ]
fsh app delete <name>                        [ Undeploy a composition ]
fsh app invoke <name>                        [ Invoke a composition and wait for its response ]
fsh app async <name>                         [ Asynchronously invoke a composition ]

fsh session list                             [ List recent app invocations ]
fsh session get <sessionId>                  [ Graphically display the result and flow of a session ]
fsh session result <sessionId>               [ Print the return value of a session ]
fsh session kill <sessionId>                 [ Kill a live session ]
fsh session purge <sessionId>                [ Purge the state of a completed session ]
```

The commands above allow you to create/update/delete a composition,
visualize the computation, invoke the app, inspect the result and
the dynamic execution graph.

### Before you run your first app

Composer allows you to orchestrate the execution of several cloud
functions, and further, to describe the dataflow between them. Its
model of computing automatically manages the state of the application
as it executes, and determines which functions to execute at any given
transition. This automatically managed state requires a backing
store, and the current implementation of Composer uses
[Redis](https://redis.io/) for this purpose.

Before running an app, you must have a valid IBM Cloud (i.e., Bluemix)
[account](https://ibm.biz/openwhisk), or deploy [Apache
OpenWhisk](https://github.com/apache/incubator-openwhisk)
locally. This is needed because Composer builds on and extends Apache
OpenWhisk, which powers IBM Cloud Functions.

* _Using composer with IBM Cloud Functions:_ you need an IBM Cloud
[account](https://ibm.biz/openwhisk), and a valid access token which
you can get using [`bx login`](https://console.bluemix.net/openwhisk/learn/cli).
_Tip:_ you do not need to perform the login operations if you simply
want to locally build and preview a composition. The setup described
here is strictly required for actually deploying and running a
composition in the IBM Cloud.

```
$ bx login -a api.ng.bluemix.net -o yourBluemixOrg -s yourBluemixSpace
```

* _Using composer with Apache OpenWhisk:_  you need a valid
`$HOME/.wskprops` file and a locally deployed OpenWhisk instance.

The shell initializes the backing store with `fsh app init`:

```
$ fsh app init --url redis://user:password@hostname:port
Waiting for redis [Done]
Successfully initialized the required services. You may now create compositions.
```

For Openwhisk, the actual command is shown below.

```
$ fsh app init --url redis://192.168.99.100:6379
```

For the IBM Cloud, you can provision a [Redis instance
yourself](redis.md) and retrieve its service keys to initialize the
shell in a similar way. Alternatively, you can use an _experimental_
auto-provisioning feature via `fsh app init --auto`. Note that
[charges will
apply](https://console.bluemix.net/catalog/services/compose-for-redis)
for the provisioned Redis instance.

The initialization step creates a package in your namespace called
`bluemix.redis` which includes useful administrative operations. Read
more about Redis provisioning [here](redis.md).

## Your first composition

Compositions are described using a [Node.js library](COMPOSER.md)
which offers an SDK for describing control structures. We call these
_combinators_.  The simplest combinator constructs a sequence. Here is
a composition snippet to create your first app: it creates a sequence
with just one function that is inlined for convenience. _You may user
your favorite editor to compose apps._ When finished, save your code
to a file with the extension `.js`.

```javascript
composer.sequence(args => ({msg: `hello ${args.name}!`}))
```

You use the `composer` to construct an application, then _compile_ it
into a [finite state machine (FSM)](FORMAT.md) representation, encoded
as a JSON object. While you can author a composition directly as an
FSM, it is far more convenient and natural to program at the level of
the Node.js library instead. It is the FSM that is used to create the
app in the IBM Cloud. [Later examples](#compositions-by-example) we will
show how to create more elaborate compositions using `if-then-else`,
`try-catch`, and `while` combinators to name a few.

_Advanced Tip:_ It is possible to compile the FSM without using the
shell, and instead using `node` directly. In this case, you must
import the `composer` and `compile` the FSM explicitly as shown below.

```javascript
$ npm install @openwhisk/composer
$ node
const composer = require('@openwhisk/composer')
const app = composer.sequence(args => ({msg: `hello ${args.name}!`}))
composer.compile(app, 'hello.json')
```

## Previewing a composition

The programming shell offers a visual representation of a composition
to quickly validate if the app represents the desired control flow
structure, before actually deploying any assets to the cloud. This
code snippet is bundled with the shell as
[`@demos/hello.js`](https://github.com/ibm-functions/shell/blob/master/app/demos/hello.js).

```bash
$ fsh app preview @demos/hello.js
```

|<img src="hello-composition.png" width="50%" title="Hello app">|
|:--:|
|Composition preview showing the control flow for the app.|

You can view the actual JSON description of the FSM by clicking on the
corresponding tab in the shell UI.

_Tip:_ The shell watches the file you are editing and automatically
updates the view as you compose. You can use this active preview mode
to incrementally build your application, sanity checking your control
flow as you go.

## Running your first app

You create and invoke apps in a manner similar to working with
OpenWhisk actions.
 
```bash
$ fsh app create hello @demos/hello.js
$ fsh app invoke hello -p name composer
{
  msg: 'hello composer!'
}
```

_Tip:_ If you have an action already named `hello`, the shell will
report a name conflict. Use a different name for your app. Apps are
stored as OpenWhisk actions, and hence the naming restrictions for
OpenWhisk apply.

All app activations are asynchronous and non-blocking. The immediate
result of an invocation is a _session id_, which you may use to query
the app for its final output. For development convenience, the shell
implements a client-side poll to provide a the final output of the
app, if it is ready within 30 seconds. Otherwise, you may use the
session id to retrieve the output; in this way, working with a session
id is similar to working with an activation id when invoking an
action.

_Tip:_ You may disable the client-side poll by using `app async`
instead of `app invoke`. The session id is returned immediately when
it is available.

```bash
$ fsh session list        # lists all recent sessions
$ fsh session result <id> # retrieves the JSON output of the app as text
```

_Note:_ Sessions only persist for up to 24 hours, and expire automatically.

## Visualizing sessions

The shell can also summarize the dynamic execution flow of an app, as
described by the app session id.

```bash
$ fsh session get <id>
```

|<img src="hello-session.png" width="50%" title="Hello session">|
|:--:|
|An example session.|

The session view uses a green color scheme for a successful
activation, and red for a failed activation (i.e., the result of the
function or app is an `error`.) The `Entry` and `Exit` nodes are the
logical start and end states of the activation. Hovering over the
nodes will typically show the result of the underlying function or
app.

## Composing OpenWhisk actions

Combinators accept either inline Node.js functions or actions by name.
For the latter, you may use a fully qualified name of an action (i.e.,
`/namespace[/package]/action`) or its short name. Here is an example
using the `date` action from the `/whisk.system/utils` package.

```javascript
composer.sequence('/whisk.system/utils/date')
```

A composition which refers to actions by name will not run correctly
if there are missing referenced entities. The `app preview` will
highlight any missing entities. As an example, preview the built-in
[`@demos/if.js`](https://github.com/ibm-functions/shell/blob/master/app/demos/if.js)
composition, which is [described in the next
section](#if-combinator). The control flow graph should be
self-explanatory. An action is gray when it is not yet deployed, and
blue otherwise.

```bash
$ fsh app preview @demos/if.js
```

|<img src="if-preview.png" title="if combinator preview" width="50%">|
|:--:|
|Control flow graph for `if` combinator. An action that is not yet deployed is gray, and blue otherwise.|

To create and deploy the actions, you may use the `wsk` CLI or the
OpenWhisk API directly. For added convenience, `fsh` uses [`npm
openwhisk`](http://github.com/openwhisk/) and can create actions
directly.  Its command structure for creating an action will be
familiar to `wsk` users (but does not offer full parity).  You may
find it convenient to use `fsh` directly instead for everything,
including to create and update actions. Read more about [`fsh` vs
`wsk`](fsh.md).

## Compositions by example

You now have the basic tools to build a serverless composition, invoke
it, and inspect its execution and result. This section will introduce
you to more combinators for creating richer control and data flow.

The following composition methods are currently supported. The rest of the document will show you example compositions using some of these combinators. The rest of the combinators are covered in the [reference manual](COMPOSER.md).

| Composition | Description | Example |
| --:| --- | --- |
| [`task`](COMPOSER.md#composertasktask-options) | single task | `composer.task('sayHi', { input: 'userInfo' })` |
| [`value`](COMPOSER.md#composervaluejson) | constant value | `composer.value({ message: 'Hello World!' })` |
| [`sequence`](COMPOSER.md#composersequencetask_1-task_2-) | sequence | `composer.sequence('getLocation', 'getWeatherForLocation')` |
| [`let`](COMPOSER.md#composerletname-value-task_1-task_2-) | variables | `composer.let('n', 42, ...)` |
| [`if`](COMPOSER.md#composerifcondition-consequent-alternate) | conditional | `composer.if('authenticate', /* then */ 'welcome', /* else */ 'login')` |
| [`while`](COMPOSER.md#composerwhilecondition-task) | loop | `composer.while('needMoreData', 'fetchMoreData')` |
| [`try`](COMPOSER.md#composertrytask-handler) | error handling | `try('DivideByN', /* catch */ 'NaN')` |
| [`repeat`](COMPOSER.md#composerrepeatcount-task) | repetition | `repeat(42, 'sayHi')` |
| [`retry`](COMPOSER.md#composerretrycount-task) | error recovery | `retry(3, 'connect')` |
| [`retain`](COMPOSER.md#composerretaintask-flag) | parameter retention | `composer.retain('validateInput')` |

### `if` combinator

An `if` combinator allows you to describe a conditional flow with a
`then` and optional `else` branch. This is convenient for
short-circuiting a sequence for example, or taking data-dependent
paths in the control flow.

Here is a short example. Say you have a function `welcome` which
generates an HTML page.

```javascript
let welcome = args => ({ html: `<html><body>welcome ${args.name}!</body></html>` })
```

In order to use this function as part of an authenticated API, we can
modify the function itself to introduce authentication middleware. Or,
we can compose it with an authentication function.

```javascript
let authenticate = args => ({ value: args.token === "secret" })
```

For illustration purposes, `authenticate` is a simple token based
checker. If the token equals the secret value, return `true`, and
`false` otherwise. In a real scenario, this function may delegate to a
third party service or identity provider.

Let's add a third function, this one to deal with the
non-authenticated case and return a different HTML page, perhaps
informing the client to try again with the proper secret.

```javascript
let login = args => ({ html: `<html><body>please say the magic word.</body></html>` })
```

The `if` combinator composes these three functions as you might
expect. This example is bundled in the shell samples as
[`@demos/if.js`](https://github.com/ibm-functions/shell/blob/master/app/demos/if.js).

```javascript
composer.if(
  /* cond */ 'authenticate',
  /* then */ 'welcome',
  /* else */ 'login')
```

```bash
# create required actions
$ fsh action create authenticate @demos/authenticate.js
$ fsh action create welcome @demos/welcome.js
$ fsh action create login @demos/login.js

# create app
$ fsh app create if @demos/if.js

# invoke app, with no secret parameter
$ fsh app invoke if
{
  html: "<html><body>please say the magic word.</body></html>"
}

# now invoke with secret parameter
$ fsh app invoke if -p token secret -p name if-combinator
{
  html: "<html><body>welcome if-combinator!</body></html>"
}
```

Each of the activations will have a different session id, which are reported by listing the available sessions.
```bash
$ fsh session list
sessionId                        app   start                 status
339c82e5e1ad45cd9c82e5e1ada5cd24 if    10/6/2017, 6:53:28 PM done  
9c361e9d06364064b61e9d0636e06482 if    10/6/2017, 6:53:21 PM done  
```

### `try` combinator

Another common composition pattern is for error handling and
recovery. Composer offers a `try` combinator that is analogous to
`try-catch`.

A example to illustrate using `try` is a schema or data validation
action. Let `validate` be an action which checks if a string is base64
encoded, and which throws an exception if the input is not valid. A
`try` combinator allows an error handler to rewrite the result, as
one example, to suite the particular usage scenario in the app.

```javascript
composer.try(
  /* try   */ 'validate',
  /* catch */ args => ({ ok: false }))
```

The `validate` action is available as [`@demos/validate.js`](https://github.com/ibm-functions/shell/blob/master/app/demos/validate.js) and the
composition as [`@demos/try.js`](https://github.com/ibm-functions/shell/blob/master/app/demos/try.js) for your convenience.

```bash
# create validate action
$ fsh action create validate @demos/validate.js

# create app
$ fsh app create try @demos/try.js

# invoke app with valid parameter
$ fsh app invoke try -p str aGVsbG8gdHJ5IQ==
{
  ok: true
}

# and now for the failing case
$ fsh app invoke try -p str bogus
{
  ok: false
}
```

It is worth looking at the execution of the second app invoke where
the catch handler is invoked.

```
$ fsh session get --last try
```

|<img src="try-session.png" title="try session with exception" width="50%">|
|:--:|
|Session execution for `try` where the handler is invoked.|


Notice that the `validate` action failed, as expected. This is
visually recognized by the red-colored action, and the hover text which
shows the action result containing the error. The app result is
successful however, as the handler rewrites the exception into a
different result.

## Nesting and forwarding

An important property of the combinators is that they nest. This
encourages modularity and composition reuse. The example that follows
illustrates both composition nesting, and data forwarding. The example
builds on the `try` app described in the previous section. Here, after
the validate task, we extend the composition with a base64 decoder to
render the input `str` in plain text.

Recall that the result of the `validate` task is `{ok: true}`,
not the `str` argument that it processed. So we need a way to forward
`str` around this action. In other words, we _retain_ the input
arguments to `validate`, and pass them to the next action in the
sequence.  Composer offers a combinator for just this purpose. Below
is the composition showing the inner sequence with the data forwarding
combinator `retain`.

```javascript
composer.try(
  composer.sequence(
    composer.retain('validate'),
    args => ({ text: new Buffer(args.params.str, 'base64').toString() })),
  args => ({ ok: false }))
```

The `retain` combinator produces an output with two fields: `params`
and `result`. The former is the input parameter of the
composition. The latter is the output of `validate`. The control and
dataflow for this composition is shown below, and is available in the
shell as
[`@demos/retain.js`](https://github.com/ibm-functions/shell/blob/master/app/demos/retain.js).

```bash
$ fsh app preview @demos/retain.js
```

|<img src="retain.png" title="retain combinator and nesting" width="50%">|
|:--:|
|Control flow graph showing the `retain` combinator and the implied dataflow around `validate`.|

The app will now produce the decoded text as its final output.

```bash
# create app
$ fsh app create try @demos/retain.js

# invoke app with valid parameter
> fsh app invoke retain -p str aGVsbG8gdHJ5IQ==
{
  text: "hello try!"
}

# and now for the failing case
> fsh app invoke retain -p str bogus
{
  ok: false
}
```

## Variables and scoping

The composer allows you to introduce variables within a composition,
and to limit their scope. This is useful when you have to introduce
service keys and credentials for example. A scoped variable is defined
using `let`. The example below illustrates how you might introduce a
"secret" for a specific task without its value escaping to other
compositions or functions.

```javascript
composer.sequence(
  composer.let({secret: 42},
    composer.task(_ => ({ ok: secret === 42 }))),
  composer.task(_ => ({ ok: (typeof secret === 'undefined') })))
```

The composition will execute successfully only if `secret` is not
leaked to the final task in the composition, while the value is
available inside the task nested within the `let`.

```bash
$ fsh app create let @demos/let.js
$ fsh app invoke let
{
  ok: true
}
```

## Other combinators

The examples shown here illustrate the more common combinators you
may use to create serverless compositions. There are more combinators
available in the Composer library. Refer to the [Composer reference
manual](COMPOSER.md) for more details.
