#!/bin/bash
set -e

# Build script for Travis-CI.

SCRIPTDIR=$(cd $(dirname "$0") && pwd)
ROOTDIR="$SCRIPTDIR/.."
IMAGE_PREFIX="composer"
WHISKDIR="$ROOTDIR/openwhisk"

# OpenWhisk stuff
cd $ROOTDIR
git clone --depth=1 https://github.com/apache/incubator-openwhisk.git openwhisk
cd openwhisk
./tools/travis/setup.sh

# Pull down images
docker pull openwhisk/controller
docker tag openwhisk/controller ${IMAGE_PREFIX}/controller
docker pull openwhisk/invoker
docker tag openwhisk/invoker ${IMAGE_PREFIX}/invoker
docker pull openwhisk/nodejs6action
docker tag openwhisk/nodejs6action ${IMAGE_PREFIX}/nodejs6action

# Deploy OpenWhisk
cd $WHISKDIR/ansible
ANSIBLE_CMD="ansible-playbook -i ${WHISKDIR}/ansible/environments/local -e docker_image_prefix=${IMAGE_PREFIX}"
$ANSIBLE_CMD setup.yml
$ANSIBLE_CMD prereq.yml
$ANSIBLE_CMD couchdb.yml
$ANSIBLE_CMD initdb.yml
$ANSIBLE_CMD wipe.yml
$ANSIBLE_CMD openwhisk.yml -e cli_installation_mode=remote

docker images
docker ps

cat $WHISKDIR/whisk.properties
curl -s -k https://172.17.0.1 | jq .
curl -s -k https://172.17.0.1/api/v1 | jq .

#Deployment
WHISK_APIHOST="172.17.0.1"
WHISK_AUTH=`cat ${WHISKDIR}/ansible/files/auth.guest`
WHISK_CLI="${WHISKDIR}/bin/wsk -i"

${WHISK_CLI} property set --apihost ${WHISK_APIHOST} --auth ${WHISK_AUTH} 
${WHISK_CLI} property get

