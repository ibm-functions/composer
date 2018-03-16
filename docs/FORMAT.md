# JSON Format

**This file has not been updated yet for v2.**

This document provides a specification of the JSON format for encoding action compositions and its semantics.

__TODO__: document the `Let` and `End` states for variable declarations.

## Principles

An action composition is a kind of [_finite state machine_](https://en.wikipedia.org/wiki/Finite-state_machine) (FSM) with one initial state and one final state. One execution of the action composition (a _trace_) consists of a finite sequence of states starting with the initial state. It is possible for the trace to end at a state other than the final state because of errors or timeouts.

Each state has a unique [_Type_](#state-types) that characterizes the behavior of the state. For example, a `Task` state can specify an OpenWhisk action to run, a `Choice` state can select a next state among two possible successor states.

The input parameter object for the action composition is the input parameter object for the first state of the composition. The output parameter object of the last state in the trace is the output parameter object of the composition (unless a failure occurs). The output parameter object of one state is the input object parameter for the next state in the trace.

An output parameter object of a `Task` state with an `error` field is an _error object_. Error objects interrupt the normal flow of execution. They are processed by the current error handler if any or abort the execution.

In addition to the implicit flow of parameter objects from state to state, an action composition has access to a stack of objects that can be manipulated explicitly using `Push` states and `Pop` states but is also used implicitly by other types of states like `Try` and `Catch`. The stack is initially empty.

## Specification

An action composition is specified by means of a JSON object. The JSON object has three mandatory fields:

 * the object field `States` lists the states in the composition,
 * the string field `Entry` is the name of the initial state of the composition,
 * the string field `Exit` is the name of the final state of the composition.

Additional fields are ignored if present.

Each field of the `States` object describes a state. The state name is the field name. State names are case sensitive and must be pairwise distinct. Each state has a string field [`Type`](#state-types) that characterizes the behavior of the state. For example, a `Task` state can specify via a string field `Action` an OpenWhisk action to run. Most states can specify a successor state via the string field `Next`.

### Example

A sequence of two actions `foo` and `bar` can be encoded as the following:

```json
{
  "Entry": "first_state",
  "Exit": "last_state",
  "States": {
    "first_state": {
      "Type": "Task",
      "Action": "foo",
      "Next": "last_state"
    },
    "last_state": {
      "Type": "Task",
      "Action": "bar"
    }
  }
}
```

### Well-formedness

A JSON object is a _well-formed_ action composition if it complies with all the requirements specified in this document. For instance mandatory fields must be present with the required types. The execution of an ill-formed composition may fail in unspecified ways.

### State Types

Each state has a mandatory string field `Type` and possibly additional fields depending on the type of the state. The supported types are `Pass`, `Task`, `Choice`, `Push`, `Pop`,  `Try`, and `Catch`.

Every state except for the final state must specify one or two potential successor states. `Choice` states have two potential successor states specified by the string fields `Then` and `Else`. Other non-final states have a single potential successor state specified by the string field `Next`. The final state cannot be a `Choice` state and cannot have a `Next` field. In an execution trace, a state is always followed by one of its potential successors.

The following fields must be specified for each type of state. Other fields are ignored.

|                                 | Pass      | Task      | Choice    | Push      | Pop       | Try       | Catch     |
| ------------------------------- |:---------:|:---------:|:---------:|:---------:|:---------:|:---------:|:---------:|
| Type                            | X | X | X | X | X | X | X |
| Next _(unless state is final)_  | X | X |   | X | X | X | X |
| Then                            |   |   | X |   |   |   |   |
| Else                            |   |   | X |   |   |   |   |
| Handler                         |   |   |   |   |   | X |   |
| _kind name_ |   | X |   |   |   |   |   |

The values of the `Next`, `Then`, `Else`, and `Handler` fields must be state names, i.e., names of fields of the `States` object. The `Task` state must specify a task to execute by providing a field named according to its _kind_. The possible field names are `Action`, `Function`, `Value`.

#### Pass State

The Pass state is the identity function on the parameter object. The execution continues with the `Next` state if defined (even if the parameter object is an error object) or terminates if there is no `Next` state (final state).

##### Examples

```json
"intermediate_state": {
  "Type": "Pass",
  "Next": "next_state"            
}
```

```json
"final_state": {
  "Type": "Pass"
}
```

#### Task State

The `Task` states must contain either a string field named `Action` or `Function` or a JSON object field named `Value`.

 * An `Action` task runs the OpenWhisk action with the specified name.
 * A `Function` task evaluates the specified Javascript function expression.
 * A `Value` task returns the specified JSON object. The input parameter object is discarded. The output parameter object is the value of the `Value` field.
 
Function expressions occurring in action compositions cannot capture any part of their environment and must return a JSON object. The two syntax `params => params` and `function (params) { return params }` are supported. A `Task` state with a `Function` field invokes the specified function expression on the input parameter object. The output parameter object is the JSON object returned by the function.
 
If the output parameter object of a `Task` state is not an error object, the execution continues with the `Next` state if defined (non-final state) or terminates if not (final state). If the output parameter object of a `Task` state is an error object, the executions continues with the current error handler if any (see [Try and Catch States](#try-and-catch-states)) or terminates if none. In essence, a `Task` state implicitly throws error objects instead of returning them.

| Output object is | not an error object | an error object |
| ---- |:----:|:----:|
| Transitions to | `Next` state if defined<br> or terminates if not defined | current error handler if any<br>or terminates if no error handler |

When transitioning to an error handler, all the objects pushed to the stack (`Push` state) since the `Try` state that introduced this error handler are popped from the stack. The error handler is also popped from the stack.

A failure to invoke an action, for instance because the action with the specified name does not exist, produces an output parameter object with an `error` field describing the error. Since this is an error object, the executions continues with the current error handler if any or terminates if none.

##### Examples

```json
"action_state": {
  "Type": "Task",
  "Action": "myAction"
}
```

```json
"function_state": {
  "Type": "Task",
  "Function": "params => { params.count++; return params }"
}
```

```json
"value_state": {
  "Type": "Task",
  "Value": {
    "error": "divide by zero"
  }
}
```

#### Push and Pop States

The `Push` state pushes a clone of the current parameter object to the top of the stack. The execution continues with the `Next` state if defined or terminates if not (final state). The output parameter object of the `Push` state is its input parameter object (no change).

The `Pop` state pops the object at the top of the stack and returns an object with two object fields `result` and `params`, where `result` is the input parameter object and `params` is the object popped from the top of the stack. The execution continues with the `Next` state if defined or terminates if not (final state).

Obviously the stack must not be empty when entering a `Pop` state. Moreover, the object at the top of the stack must have been pushed onto the stack using a `Push` state.

The field names `result` and `params` are chosen so that a sequential composition of three states of type `Push`, `Task`, and `Pop` in this order returns an object where the `params` field contains the input parameter object for the composition and the `result` field contains the output parameter object of the `Task` state.

##### Example

```json
"push_state": {
  "Type": "Push",
  "Next": "function_state"                  
},
"function_state": {
  "Type": "Task",
  "Function": "params => { params.count++; return params }",           
  "Next": "pop_state"                  
},
"pop_state": {
  "Type": "Pop"
}
```

#### Choice State

The `Choice` state decides among two potential successor states. The execution continues with the `Then` state if the `value` field of the input parameter object is defined and holds JSON's `true` value. It continues with the `Else` state otherwise.

The `Choice` state pops and returns the object at the top of the stack discarding the input parameter object. The `Choice` state is typically used in a sequential composition of three states of type `Push`, `Task`, and `Choice` in this order so that the input parameter object for the composition is also the input parameter object for the `Then` or `Else` state.

Obviously the stack must not be empty when entering a `Choice` state. Moreover, the object at the top of the stack must have been pushed onto the stack using a `Push` state.

##### Example

```json
"push_state": {
  "Type": "Push",
  "Next": "condition_state"                  
},
"condition_state": {
  "Type": "Task",
  "Function": "params => ({ value: params.count % 2 == 0 })",           
  "Next": "choice_state"                  
},
"choice_state": {
  "Type": "Choice",
  "Then": "even_state",
  "Else": "odd_state"
}
```

#### Try and Catch States

The `Try` and `Catch` states manage error handlers, i.e., error handling states. The `Try` state pushes a new error handling state whose name is given by its string field `Handler` onto the stack. The `Catch` state pops the handling state at the top of the stack. The topmost handling state is the current handling state that is transitioned to when a `Task` state produces an error object.

The execution of a `Try` or `Catch` state continues with the `Next` state if defined or terminates if not (final state). The output parameter object of the `Try` or `Catch` state is its input parameter object (no change). 

Obviously the stack must not be empty when entering a `Catch` state. Moreover, the topmost stack element must have been created using a `Try` state.

##### Example

```json
"try_state": {
  "Type": "Try",
  "Handler": "handler_state",
  "Next": "function_state"                  
},
"function_state": {
  "Type": "Task",
  "Function": "params => (params.den == 0 ? { error: 'divide by 0' } : { result: params.num / params.den })",           
  "Next": "catch_state"                  
},
"catch_state": {
  "Type": "Catch",
  "Next": "output_state" 
},
"output_state": {
  "Type": "Task",
  "Function": "params => ({ message: 'Ratio: ' + params.result })",
  "Next": "final_state" 
},
"handler_state": {
  "Type": "Task",
  "Function": "params => ({ message: 'Error: ' + params.error })",
  "Next": "final_state" 
},
"final_state": {
  "Type": "Pass"
}
```
