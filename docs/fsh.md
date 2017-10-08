## The functions programming shell: `fsh`

For a while now, we've contemplated the possibility of a hybrid
approach to interacting with cloud services. Use a CLI style of
interaction for the command structure, but weave in graphics where it
helps. 

* The CLI experience is pleasantly non-modal. You can switch from one
task to another, without having to click through various links,
navigating your way to your next task. Plus, you can easily persist
your thought process, by pasting commands into a shell script.

* The graphical interface helps with visualizing the output of
commands, and with bridging from one command to the other. For
example, every reference to an OpenWhisk entity, or to a previously
executed command, is a clickable link. For example, after listing
one's actions via the `ls` command, clicking on the name of an action
opens the sidecar and has the details of that action displayed in a
pleasant form.

Local development is also important, so we don't have to endure the
often laggy nature of browser-based tools. Access to our local
file system is also key. And with the advent of
[Electron](https://electron.atom.io/), it is possible to develop a
rich local development environment that suits these needs.

The shell may be used directly from the command line and offers many
of the [Apache
OpenWhisk](https://github.com/apache/incubator-openwhisk) `wsk` CLI
commands, even following the same command structure. It is not a full
replacement however as there are still some gaps in functionality. We
do not intend for the shell CLI to replace the `wsk` CLI. You can
freely mix `wsk` and `fsh` commands. We find it more convenient
however to use the latter particularly when working with Composer.

