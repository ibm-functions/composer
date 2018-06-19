# Compose Command

The `compose` command makes it possible to deploy compositions from the command line.

The `compose` command is intended as a minimal complement to the OpenWhisk CLI. The OpenWhisk CLI already has the capability to configure, invoke, and delete compositions (since these are just OpenWhisk actions) but lacks the capability to create composition actions. The `compose` command bridges this gap. It makes it possible to deploy compositions as part of the development cycle or in shell scripts. It is not a replacement for the OpenWhisk CLI however as it does not duplicate existing OpenWhisk CLI capabilities. Moreover, for a much richer developer experience, we recommend using [Shell](https://github.com/ibm-functions/shell).

## Usage

```
compose
```
```
Usage:
  compose composition.js[on] command [flags]
Commands:
  --json                 output the json representation for the composition (default command)
  --deploy NAME          deploy the composition with name NAME
  --entity NAME          output the conductor action definition for the composition (giving name NAME to the composition)
  --entities NAME        convert the composition into an array of action definition (giving name NAME to the composition)
  --encode               output the conductor action code for the composition
Flags:
  --lower [VERSION]      lower to primitive combinators or specific composer version
  --apihost HOST         API HOST
  -u, --auth KEY         authorization KEY
  -i, --insecure         bypass certificate checking
  -v, --version          output the composer version
  --quiet                omit detailed diagnostic messages
  --composer COMPOSER    instantiate a custom composer module
```
The `compose` command requires either a Javascript file that evaluates to a composition (for example [demo.js](../samples/demo.js)) or a JSON file that encodes a composition (for example [demo.json](../samples/demo.json)). The JSON format is documented in [FORMAT.md](FORMAT.md).

The `compose` command has several modes of operation:
- By default or when the `--json` option is specified, the command returns the composition encoded as a JSON dictionary.
- When the `--deploy` option is specified, the command deploys the composition given the desired name for the composition.
- When the `--encode` option is specified, the command returns the Javascript code for the [conductor action](https://github.com/apache/incubator-openwhisk/blob/master/docs/conductors.md) for the composition.
- When the `--entity` option is specified, the command returns the complete conductor action definition as a JSON dictionary.
- When the `--entities` option is specified, the command returns an array of action definitions including not only the conductor action for the composition, but possibly also the nested action definitions.

## JSON option

By default, the `compose` command evaluates the composition code and outputs the resulting JSON dictionary:
```
compose demo.js
```
```json
{
    "type": "if",
    "test": {
        "type": "action",
        "name": "/_/authenticate",
        "action": {
            "exec": {
                "kind": "nodejs:default",
                "code": "const main = function ({ password }) { return { value: password === 'abc123' } }"
            }
        }
    },
    "consequent": {
        "type": "action",
        "name": "/_/success",
        "action": {
            "exec": {
                "kind": "nodejs:default",
                "code": "const main = function () { return { message: 'success' } }"
            }
        }
    },
    "alternate": {
        "type": "action",
        "name": "/_/failure",
        "action": {
            "exec": {
                "kind": "nodejs:default",
                "code": "const main = function () { return { message: 'failure' } }"
            }
        }
    }
}

## Entity option

With the `--entity` option the `compose` command returns the conductor action definition for the composition.
```
compose demo.js --entity demo
```
```json
{
    "name": "/_/demo",
    "action": {
        "exec": {
            "kind": "nodejs:default",
            "code": "..."
        },
        "annotations": [
            {
                "key": "conductor",
                "value": {
                    "type": "if",
                    "test": {
                        "type": "action",
                        "name": "/_/authenticate"
                    },
                    "consequent": {
                        "type": "action",
                        "name": "/_/success"
                    },
                    "alternate": {
                        "type": "action",
                        "name": "/_/failure"
                    }
                }
            },
            {
                "key": "composer",
                "value": "0.4.0"
            }
        ]
    }
}
```


## Entities option

With the `--entities` option the `compose` command returns not only the conductor action definition for the composition but also the definitions of nested actions and compositions.
```
compose demo.js --entities demo
```
```json
[
    {
        "name": "/_/authenticate",
        "action": {
            "exec": {
                "kind": "nodejs:default",
                "code": "const main = function ({ password }) { return { value: password === 'abc123' } }"
            }
        }
    },
    {
        "name": "/_/success",
        "action": {
            "exec": {
                "kind": "nodejs:default",
                "code": "const main = function () { return { message: 'success' } }"
            }
        }
    },
    {
        "name": "/_/failure",
        "action": {
            "exec": {
                "kind": "nodejs:default",
                "code": "const main = function () { return { message: 'failure' } }"
            }
        }
    },
    {
        "name": "/_/demo",
        "action": {
            "exec": {
                "kind": "nodejs:default",
                "code": "..."
            },
            "annotations": [
                {
                    "key": "conductor",
                    "value": {
                        "type": "if",
                        "test": {
                            "type": "action",
                            "name": "/_/authenticate"
                        },
                        "consequent": {
                            "type": "action",
                            "name": "/_/success"
                        },
                        "alternate": {
                            "type": "action",
                            "name": "/_/failure"
                        }
                    }
                },
                {
                    "key": "composer",
                    "value": "0.4.0"
                }
            ]
        }
    }
]

```

## Deploy option

The `--deploy` option makes it possible to deploy a composition (Javascript or JSON) given the desired name for the composition:
```
compose demo.js --deploy demo
```
```
ok: created actions /_/authenticate,/_/success,/_/failure,/_/demo
```
Or:
```
compose demo.js > demo.json
compose demo.json --deploy demo
```
```
ok: created actions /_/authenticate,/_/success,/_/failure,/_/demo
```
The `compose` command synthesizes and deploys a conductor action that implements the
composition with the given name. It also deploys the composed actions for which
definitions are provided as part of the composition.

The `compose` command outputs the list of deployed actions or an error result. If an error occurs during deployment, the state of the various actions is unknown.

The `compose` command deletes the deployed actions before recreating them if necessary. As a result, default parameters, limits, and annotations on preexisting actions are lost.

### Configuration

Like the OpenWhisk CLI, the `compose` command supports the following flags for specifying the OpenWhisk deployment to use:
```
 --apihost HOST         API HOST
  -u, --auth KEY        authorization KEY
  -i, --insecure        bypass certificate checking
```
If the `--apihost` flag is absent, the environment variable `__OW_API_HOST` is used in its place. If neither is available, the `compose` command extracts the `APIHOST` key from the whisk property file for the current user.

If the `--auth` flag is absent, the environment variable `__OW_API_KEY` is used in its place. If neither is available, the `compose` command extracts the `AUTH` key from the whisk property file for the current user.

The default path for the whisk property file is `$HOME/.wskprops`. It can be altered by setting the `WSK_CONFIG_FILE` environment variable.

## Encode option

The `compose` command returns the code of the conductor action for the composition (Javascript or JSON) when invoked with the `--encode` option.
For instance, the conductor action code for the [demo.js](../samples/demo.js) composition is [demo-conductor.js](../samples/demo-conductor.js):
```
compose demo.js --encode > demo-conductor.js
```
This code may be deployed using the OpenWhisk CLI:
```
wsk action create demo demo-conductor.js -a conductor true
```
```
ok: created action demo
```
The conductor action code does not include definitions for nested actions or compositions.

## Lowering

If the `--lower VERSION` option is specified, the `compose` command uses the set of combinators of the specified revision of the `composer` module. Derived combinators that are more recent (if any) are translated into combinators of the older set.

If the `--lower` option is specified without a version number, the `compose` command uses only primitive combinators.

These options may be combined with any of the `compose` commands.

## Composer option

If the composition code uses a custom `composer` module, the path to the module must be specified via the `--composer` option.