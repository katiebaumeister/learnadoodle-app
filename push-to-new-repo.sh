#!/bin/bash
# Script to push current Learnadoodle app to a new GitHub repository
# Usage: ./push-to-new-repo.sh <new-repo-url>

if [ -z "$1" ]; then
  echo "Usage: ./push-to-new-repo.sh <new-repo-url>"
  echo "Example: ./push-to-new-repo.sh https://github.com/yourusername/learnadoodle-snapshot.git"
  exit 1
fi

NEW_REPO_URL=$1

echo "Adding new remote 'snapshot' pointing to: $NEW_REPO_URL"
git remote add snapshot $NEW_REPO_URL

echo "Pushing main branch to new repository..."
git push snapshot main

echo "Done! Your code is now in the new repository."
echo "To view remotes: git remote -v"
echo "To remove the snapshot remote later: git remote remove snapshot"
















