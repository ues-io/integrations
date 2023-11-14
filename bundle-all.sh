#!/usr/bin/env bash

# DIE if any command fails
set -e

# Deploy all apps
for dir in ./apps/*; do
    bash bundle.sh $dir
done