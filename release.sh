#!/bin/bash

# Release script for signalk-noaa-weather-report plugin
# Usage: ./release.sh "commit message" [patch|minor|major]

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if commit message is provided
if [ $# -lt 1 ]; then
    print_error "Usage: $0 \"commit message\" [patch|minor|major]"
    print_error "Example: $0 \"Fix weather data parsing\" patch"
    exit 1
fi

COMMIT_MESSAGE="$1"
VERSION_TYPE="${2:-patch}"  # Default to patch if not specified

# Validate version type
if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
    print_error "Version type must be patch, minor, or major"
    exit 1
fi

print_status "Starting release process..."
print_status "Commit message: $COMMIT_MESSAGE"
print_status "Version type: $VERSION_TYPE"

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    print_error "Not in a git repository"
    exit 1
fi

# Check if there are uncommitted changes (but we'll handle them automatically)
if ! git diff-index --quiet HEAD --; then
    print_status "Found uncommitted changes. Will add and commit them automatically."
fi

# Build the plugin
print_status "Building plugin..."
npm run build
if [ $? -ne 0 ]; then
    print_error "Build failed"
    exit 1
fi
print_success "Plugin built successfully"

# Commit changes
print_status "Committing changes..."
git add .
git commit -m "$COMMIT_MESSAGE"
if [ $? -ne 0 ]; then
    print_error "Commit failed"
    exit 1
fi
print_success "Changes committed"

# Push to remote
print_status "Pushing to remote repository..."
git push origin main
if [ $? -ne 0 ]; then
    print_error "Push failed"
    exit 1
fi
print_success "Changes pushed to remote"

# Bump version
print_status "Bumping version ($VERSION_TYPE)..."
npm version $VERSION_TYPE --no-git-tag-version
if [ $? -ne 0 ]; then
    print_error "Version bump failed"
    exit 1
fi

# Get the new version
NEW_VERSION=$(node -p "require('./package.json').version")
print_success "Version bumped to $NEW_VERSION"

# Commit version bump
print_status "Committing version bump..."
git add package.json
git commit -m "Bump version to $NEW_VERSION"
git push origin main
if [ $? -ne 0 ]; then
    print_error "Version commit/push failed"
    exit 1
fi

# Create and push tag
print_status "Creating and pushing tag..."
git tag "v$NEW_VERSION"
git push origin "v$NEW_VERSION"
if [ $? -ne 0 ]; then
    print_error "Tag creation/push failed"
    exit 1
fi
print_success "Tag v$NEW_VERSION created and pushed"

# Publish to npm
print_status "Publishing to npm..."
npm publish
if [ $? -ne 0 ]; then
    print_error "npm publish failed"
    exit 1
fi
print_success "Published to npm successfully"

print_success "🎉 Release $NEW_VERSION completed successfully!"
print_status "Plugin is now available at: https://www.npmjs.com/package/signalk-noaa-weather-report"
print_status "GitHub repository: https://github.com/kpconnell/signalk-noaa-windy-plugin" 