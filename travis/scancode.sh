#!/bin/bash
# Licensed to the Apache Software Foundation (ASF) under one or more contributor
# license agreements; and to You under the Apache License, Version 2.0.

set -e

SCRIPTDIR=$(cd $(dirname "$0") && pwd)
ROOTDIR="$SCRIPTDIR/../"
HOMEDIR="$SCRIPTDIR/../../"
UTIL_DIR="$HOMEDIR/incubator-openwhisk-utilities"

# clone OpenWhisk utilities repo. in order to run scanCode.py
cd $HOMEDIR
git clone https://github.com/apache/incubator-openwhisk-utilities.git

# run scancode
cd $UTIL_DIR
scancode/scanCode.py --config scancode/ASF-Release.cfg $ROOTDIR
