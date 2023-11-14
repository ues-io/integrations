#!/usr/bin/env bash

dir=$1

# DIE if any command fails
set -e

echo "***********************************"
echo "Packaging $dir"
echo "***********************************"
cd $dir

uesio login
uesio work -n main
uesio deploy

echo "Creating new patch bundle..."

patchResult=$(uesio bundle create -t=patch)

# Extract version number from patchResult variable using grep
version=$(echo "$patchResult" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')

echo "Created bundle with version = $version"

cd - >> /dev/null
