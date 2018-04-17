# JSON Format

Compositions are encoded as JSON dictionaries prior to deployment. For instance the composition in [demo.js](../samples/demo.js) is encoded as:
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
```
This json dictionary has one mandatory field named `type` with the name of the combinator and possible other fields that depend on the specific combinator. The values of some of these fields may be themselves composition dictionaries. In this example, the `test`, `consequent`, and `alternate` fields are compositions of `type` action.

The field names and types typically match the combinator method signatures:

| Type | Fields |
| --:| --- | 
| `action` | name |
| `function`] | function |
| `literal` or `value` | value |
| `composition` | name, composition |
| `empty` |
| `sequence` or `seq`sequence) | components |
| `let` | declarations, components |
| `mask`| components |
| `if` and `if_nosave` | test, consequent, alternate |
| `while` and `while_nosave` | test, body |
| `dowhile` and `dowhile_nosave` | body, test |
| `repeat` | count, components |
| `try` | body, handler |
| `finally` | body, finalizer |
| `retry` | count, components |
| `retain` and `retain_catch` | components |