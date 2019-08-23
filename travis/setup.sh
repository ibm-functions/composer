#!/bin/bash

#
# Licensed to the Apache Software Foundation (ASF) under one or more
# contributor license agreements.  See the NOTICE file distributed with
# this work for additional information regarding copyright ownership.
# The ASF licenses this file to You under the Apache License, Version 2.0
# (the "License"); you may not use this file except in compliance with
# the License.  You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#

set -e

# Build script for Travis-CI.

SCRIPTDIR=$(cd $(dirname "$0") && pwd)
ROOTDIR="$SCRIPTDIR/.."
WHISKDIR="$ROOTDIR/openwhisk"

# Prefetch docker images
docker pull openwhisk/controller &
docker pull openwhisk/invoker &
docker pull openwhisk/nodejs6action &

# Clone OpenWhisk
cd $ROOTDIR
git clone --depth=1 https://github.com/apache/openwhisk.git openwhisk

# Install Ansible
pip install --user ansible==2.5.2

# Configure runtimes
cp $SCRIPTDIR/runtimes.json $WHISKDIR/ansible/files

# Deploy OpenWhisk
cd $WHISKDIR/ansible
ANSIBLE_CMD="ansible-playbook -i ${WHISKDIR}/ansible/environments/local -e docker_image_prefix=openwhisk  -e docker_image_tag=nightly"
$ANSIBLE_CMD setup.yml
$ANSIBLE_CMD prereq.yml
$ANSIBLE_CMD couchdb.yml
$ANSIBLE_CMD initdb.yml
$ANSIBLE_CMD wipe.yml
$ANSIBLE_CMD openwhisk.yml -e cli_installation_mode=remote -e limit_invocations_per_minute=600

# Deploy Redis
docker run -d -p 6379:6379 --name redis redis:4.0

# Log configuration
docker images
docker ps
curl -s -k https://172.17.0.1 | jq .
curl -s -k https://172.17.0.1/api/v1 | jq .

# Setup CLI
WHISK_APIHOST="172.17.0.1"
WHISK_AUTH=`cat ${WHISKDIR}/ansible/files/auth.guest`
WHISK_CLI="${WHISKDIR}/bin/wsk -i"

${WHISK_CLI} property set --apihost ${WHISK_APIHOST} --auth ${WHISK_AUTH}
${WHISK_CLI} property get
