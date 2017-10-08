# Execution Model

Action compositions are invoked by means of a helper [conductor](../conductor.js) action. Results of completed action compositions, execution traces, and intermediate states of live action compositions are stored in a [Redis](https://redis.io/) instance. A Node.js [manager](../manager.js) library provides an interface to the Redis instance. One execution of an action composition is a session.

## Conductor Action

The conductor action schedules the execution of the composed actions, manages the session state, and executes inline functions.

## Execution Trace

A complete trace of execution starts and ends with a conductor activation and alternates conductor activations with activations of the composed actions. For instance, assuming no error, an invocation of the composition `composer.sequence('action1', 'action2', 'action3')` eventually produces the trace:

 * `conductor`
 * `action1`
 * `conductor`
 * `action2`
 * `conductor`
 * `action3`
 * `conductor`

## Session id

One execution of an action composition is a session. The session is identified by a session id. The session id is equal to the activation id for the first invocation of the `conductor` action in the execution trace for the session.

## Manager Library

The manager library makes it possible to retrieve session results and execution traces, kill live compositions, and purge sessions from Redis.