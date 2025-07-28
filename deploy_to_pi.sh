#!/bin/bash

# SignalK Plugin Deployment Script for Raspberry Pi
# This script deploys the wx-nmea-signalk-plugin to a Raspberry Pi running SignalK

# Configuration
PI_USER="kevin"
PI_HOST="raspberrypi.local"
SIGNALK_USER="kevin"
SIGNALK_PORT="80"
PLUGIN_NAME="wx-nmea-signalk-plugin"

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

# Check if we're in the plugin directory
if [ ! -f "package.json" ] || [ ! -d "src" ] || [ ! -d "plugin" ]; then
    print_error "Must be run from the wx-nmea-signalk-plugin directory"
    exit 1
fi

# Check if plugin is built
if [ ! -f "plugin/index.js" ]; then
    print_warning "Plugin not built. Building now..."
    npm run build
    if [ $? -ne 0 ]; then
        print_error "Failed to build plugin"
        exit 1
    fi
fi

print_status "Starting deployment of SignalK plugin to Raspberry Pi..."

# Test connection to Pi
print_status "Testing connection to $PI_HOST..."
ssh -o ConnectTimeout=5 $PI_HOST "echo 'Connection successful'" > /dev/null 2>&1
if [ $? -ne 0 ]; then
    print_error "Cannot connect to $PI_HOST"
    print_error "Please check:"
    print_error "  - Raspberry Pi is powered on and connected to network"
    print_error "  - SSH is enabled on the Pi"
    print_error "  - Hostname/IP address is correct"
    print_error "  - SSH keys are set up or you can authenticate"
    exit 1
fi
print_success "Connected to Raspberry Pi"

# Check if SignalK is installed
print_status "Checking SignalK installation..."
SIGNALK_HOME=$(ssh $PI_HOST "sudo -u $SIGNALK_USER bash -c 'echo \$HOME'" 2>/dev/null)
if [ -z "$SIGNALK_HOME" ]; then
    print_error "SignalK user '$SIGNALK_USER' not found on Pi"
    print_error "Please install SignalK server first or adjust SIGNALK_USER variable"
    exit 1
fi

SIGNALK_NODE_MODULES="$SIGNALK_HOME/.signalk/node_modules"
ssh $PI_HOST "sudo -u $SIGNALK_USER test -d $SIGNALK_NODE_MODULES"
if [ $? -ne 0 ]; then
    print_error "SignalK node_modules directory not found at $SIGNALK_NODE_MODULES"
    print_error "Please check SignalK installation"
    exit 1
fi
print_success "SignalK installation found"

# Clean up existing plugin configuration
print_status "Cleaning up existing plugin configuration..."
SIGNALK_CONFIG_DIR="$SIGNALK_HOME/.signalk"

# Remove plugin from settings.json
ssh $PI_HOST "sudo -u $SIGNALK_USER bash -c '
if [ -f $SIGNALK_CONFIG_DIR/settings.json ]; then
    # Create backup of settings
    cp $SIGNALK_CONFIG_DIR/settings.json $SIGNALK_CONFIG_DIR/settings.json.backup
    
    # Remove plugin configuration using jq if available, otherwise use sed
    if command -v jq >/dev/null 2>&1; then
        jq \"del(.plugins[\\\"$PLUGIN_NAME\\\"])\" $SIGNALK_CONFIG_DIR/settings.json > $SIGNALK_CONFIG_DIR/settings.json.tmp && mv $SIGNALK_CONFIG_DIR/settings.json.tmp $SIGNALK_CONFIG_DIR/settings.json
    else
        # Fallback: remove plugin section with sed (basic removal)
        sed -i \"/\\\"$PLUGIN_NAME\\\"/,/^[[:space:]]*}/d\" $SIGNALK_CONFIG_DIR/settings.json
    fi
fi
'"

# Remove plugin from security.json
ssh $PI_HOST "sudo -u $SIGNALK_USER bash -c '
if [ -f $SIGNALK_CONFIG_DIR/security.json ]; then
    # Create backup of security settings
    cp $SIGNALK_CONFIG_DIR/security.json $SIGNALK_CONFIG_DIR/security.json.backup
    
    # Remove plugin security configuration
    if command -v jq >/dev/null 2>&1; then
        jq \"del(.plugins[\\\"$PLUGIN_NAME\\\"])\" $SIGNALK_CONFIG_DIR/security.json > $SIGNALK_CONFIG_DIR/security.json.tmp && mv $SIGNALK_CONFIG_DIR/security.json.tmp $SIGNALK_CONFIG_DIR/security.json
    fi
fi
'"

# Remove any plugin-specific data directories and configuration files
ssh $PI_HOST "sudo -u $SIGNALK_USER bash -c '
if [ -d $SIGNALK_CONFIG_DIR/plugin-config-data/$PLUGIN_NAME ]; then
    rm -rf $SIGNALK_CONFIG_DIR/plugin-config-data/$PLUGIN_NAME
fi
if [ -f $SIGNALK_CONFIG_DIR/plugin-config-data/$PLUGIN_NAME.json ]; then
    rm -f $SIGNALK_CONFIG_DIR/plugin-config-data/$PLUGIN_NAME.json
fi
'"

# Remove existing plugin directory completely
ssh $PI_HOST "sudo -u $SIGNALK_USER rm -rf $SIGNALK_NODE_MODULES/$PLUGIN_NAME"

print_success "Plugin configuration cleaned up"

# Create plugin directory on Pi
PLUGIN_PATH="$SIGNALK_NODE_MODULES/$PLUGIN_NAME"
print_status "Creating plugin directory on Pi..."
ssh $PI_HOST "sudo -u $SIGNALK_USER mkdir -p $PLUGIN_PATH"
if [ $? -ne 0 ]; then
    print_error "Failed to create plugin directory"
    exit 1
fi

# Copy plugin files to Pi
print_status "Copying plugin files to Pi..."
# Create a temporary directory with only the files we need
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Copy essential files
cp package.json "$TEMP_DIR/"
cp test.js "$TEMP_DIR/"
cp README.md "$TEMP_DIR/"
cp -r plugin "$TEMP_DIR/"
cp -r public "$TEMP_DIR/"
cp -r src "$TEMP_DIR/"

# Use rsync to copy files efficiently
rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '*.log' \
    --exclude 'logs' \
    "$TEMP_DIR/" $PI_HOST:"$PLUGIN_PATH/"

if [ $? -ne 0 ]; then
    print_error "Failed to copy files to Pi"
    exit 1
fi
print_success "Files copied to Pi"

# Install dependencies on Pi
print_status "Installing plugin dependencies on Pi..."
ssh $PI_HOST "cd $PLUGIN_PATH && sudo -u $SIGNALK_USER npm install --production"
if [ $? -ne 0 ]; then
    print_error "Failed to install dependencies"
    exit 1
fi
print_success "Dependencies installed"

# Create logs directory
print_status "Creating logs directory..."
ssh $PI_HOST "sudo -u $SIGNALK_USER mkdir -p $PLUGIN_PATH/logs"

# Set correct permissions
print_status "Setting file permissions..."
ssh $PI_HOST "sudo chown -R $SIGNALK_USER:$SIGNALK_USER $PLUGIN_PATH"
ssh $PI_HOST "sudo chmod -R 755 $PLUGIN_PATH"

# Test plugin functionality
print_status "Testing plugin functionality..."
ssh $PI_HOST "cd $PLUGIN_PATH && sudo -u $SIGNALK_USER npm test"
if [ $? -ne 0 ]; then
    print_warning "Plugin tests failed, but continuing with deployment"
else
    print_success "Plugin tests passed"
fi

# Check if SignalK server is running
print_status "Checking SignalK server status..."
SIGNALK_RUNNING=$(ssh $PI_HOST "sudo systemctl is-active signalk" 2>/dev/null)
if [ "$SIGNALK_RUNNING" = "active" ]; then
    print_status "SignalK server is running"
    
    # Automatically restart SignalK server to load the plugin
    print_status "Restarting SignalK server to load the plugin..."
    ssh $PI_HOST "sudo systemctl restart signalk"
    if [ $? -eq 0 ]; then
        print_success "SignalK server restarted"
        
        # Wait a moment for server to start
        sleep 5
        
        # Check if server is running
        SIGNALK_STATUS=$(ssh $PI_HOST "sudo systemctl is-active signalk" 2>/dev/null)
        if [ "$SIGNALK_STATUS" = "active" ]; then
            print_success "SignalK server is running"
        else
            print_warning "SignalK server may not have started properly"
            print_status "Check logs with: sudo journalctl -u signalk -f"
        fi
    else
        print_error "Failed to restart SignalK server"
    fi
else
    print_warning "SignalK server is not running"
    print_status "Start it with: sudo systemctl start signalk"
fi

# Display deployment summary
print_success "Plugin deployment completed!"
echo ""
echo -e "${BLUE}Deployment Summary:${NC}"
echo "  Plugin installed at: $PLUGIN_PATH"
echo "  SignalK user: $SIGNALK_USER"
echo "  Plugin files: $(ssh $PI_HOST "ls -la $PLUGIN_PATH" | wc -l) items"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "1. Access SignalK admin interface at: http://$PI_HOST:$SIGNALK_PORT"
echo "2. Go to Server → Plugin Config → NOAA / Windy Ship Reporting Plugin"
echo "3. Enable and configure the plugin"
echo "4. Access plugin web interface at: http://$PI_HOST:$SIGNALK_PORT/plugins/$PLUGIN_NAME/"
echo ""
echo -e "${BLUE}Useful Commands:${NC}"
echo "  Check SignalK status: ssh $PI_HOST 'sudo systemctl status signalk'"
echo "  View SignalK logs: ssh $PI_HOST 'sudo journalctl -u signalk -f'"
echo "  Check plugin files: ssh $PI_HOST 'ls -la $PLUGIN_PATH'"
echo ""
print_success "Deployment complete! 🚀" 