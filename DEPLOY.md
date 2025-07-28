# Raspberry Pi Deployment Guide

This guide explains how to deploy the SignalK VOS NOAA Weather Report plugin to a Raspberry Pi running SignalK server.

## Prerequisites

### On Your Development Machine
- The plugin must be built (`npm run build`)
- SSH access to your Raspberry Pi
- `rsync` installed (usually available by default on macOS/Linux)

### On Your Raspberry Pi
- SignalK server installed and configured
- SSH enabled
- Node.js and npm installed (usually comes with SignalK)

## Configuration

Before running the deployment script, you may need to modify the configuration variables at the top of `deploy_to_pi.sh`:

```bash
PI_USER="piuser"                 # SSH user on the Pi
PI_HOST="raspberrypi.local"     # Pi hostname or IP address
SIGNALK_USER="signalk"          # SignalK service user
SIGNALK_PORT="80"               # SignalK web interface port
PLUGIN_NAME="noaa-vos-signalk-plugin"
```

### Common Configuration Changes

**Different Pi hostname/IP:**
```bash
PI_HOST="192.168.1.100"  # Use IP address
PI_HOST="myboat.local"   # Use custom hostname
```

**Different SSH user:**
```bash
PI_USER="ubuntu"  # For Ubuntu-based Pi images
```

**Different SignalK user:**
```bash
SIGNALK_USER="pi"  # If SignalK runs under pi user
```

## Deployment Steps

1. **Ensure plugin is built:**
   ```bash
   npm run build
   ```

2. **Run the deployment script:**
   ```bash
   ./deploy_to_pi.sh
   ```

## What the Script Does

1. **Validates environment** - Checks that you're in the plugin directory and plugin is built
2. **Tests SSH connection** - Verifies it can connect to your Pi
3. **Checks SignalK installation** - Confirms SignalK is installed and finds the correct paths
4. **Creates plugin directory** - Sets up the plugin directory in SignalK's node_modules
5. **Copies files** - Uses rsync to efficiently copy plugin files (excludes node_modules, logs, etc.)
6. **Installs dependencies** - Runs `npm install --production` on the Pi
7. **Sets permissions** - Ensures correct file ownership and permissions
8. **Tests plugin** - Runs the plugin test suite on the Pi
9. **Offers to restart SignalK** - Prompts to restart SignalK server to load the plugin

## After Deployment

### Enable the Plugin

1. Open your SignalK admin interface: `http://raspberrypi.local:80`
2. Navigate to **Server** → **Plugin Config**
3. Find **NOAA / Windy Ship Reporting Plugin**
4. Click **Enable** and configure settings
5. Click **Submit** to save

### Access the Plugin Interface

Visit: `http://raspberrypi.local:80/plugins/noaa-vos-signalk-plugin/`

### Configuration Options

- **Number of samples**: How many data points to average (default: 3)
- **Sample interval**: Seconds between samples (default: 5)
- **Report interval**: Minutes between automatic reports (0 = manual only)
- **Station ID**: Your weather station identifier
- **Send to Google Form**: Enable automatic form submission
- **Test mode**: Log data without actually sending (recommended initially)

## Troubleshooting

### SSH Connection Issues

**"Cannot connect to pi@raspberrypi.local"**
- Check if Pi is powered on and connected to network
- Try using IP address instead of hostname
- Verify SSH is enabled: `sudo systemctl enable ssh && sudo systemctl start ssh`
- Test manual connection: `ssh raspberrypi.local`

### SignalK Issues

**"SignalK user 'signalk' not found"**
- Check how SignalK is installed on your Pi
- Try changing `SIGNALK_USER` to `pi` if SignalK runs under pi user
- Check SignalK status: `sudo systemctl status signalk`

**"SignalK node_modules directory not found"**
- Verify SignalK installation: `which signalk-server`
- Check SignalK home directory: `sudo -u signalk echo $HOME`

### Plugin Issues

**Plugin not appearing in SignalK**
- Restart SignalK server: `sudo systemctl restart signalk`
- Check SignalK logs: `sudo journalctl -u signalk -f`
- Verify plugin files: `ls -la ~/.signalk/node_modules/noaa-vos-signalk-plugin/`

**Plugin tests failing**
- Check if all dependencies installed correctly
- Verify Node.js version compatibility
- Review test output for specific errors

### Permission Issues

**"Permission denied" errors**
- The script sets correct permissions, but if issues persist:
```bash
sudo chown -R signalk:signalk ~/.signalk/node_modules/noaa-vos-signalk-plugin/
sudo chmod -R 755 ~/.signalk/node_modules/noaa-vos-signalk-plugin/
```

## Manual Deployment

If the script fails, you can deploy manually:

1. **Copy files to Pi:**
   ```bash
   scp -r noaa-vos-signalk-plugin/ raspberrypi.local:~/
   ```

2. **SSH to Pi and move files:**
   ```bash
   ssh raspberrypi.local
   sudo mv noaa-vos-signalk-plugin ~/.signalk/node_modules/
sudo chown -R signalk:signalk ~/.signalk/node_modules/noaa-vos-signalk-plugin/
   ```

3. **Install dependencies:**
   ```bash
   cd ~/.signalk/node_modules/noaa-vos-signalk-plugin/
   sudo -u signalk npm install --production
   ```

4. **Restart SignalK:**
   ```bash
   sudo systemctl restart signalk
   ```

## Useful Commands

After deployment, these commands are helpful:

```bash
# Check SignalK status
ssh raspberrypi.local 'sudo systemctl status signalk'

# View SignalK logs
ssh raspberrypi.local 'sudo journalctl -u signalk -f'

# Check plugin files
ssh raspberrypi.local 'ls -la ~/.signalk/node_modules/noaa-vos-signalk-plugin/'

# Test plugin on Pi
ssh raspberrypi.local 'cd ~/.signalk/node_modules/noaa-vos-signalk-plugin/ && npm test'

# Restart SignalK
ssh raspberrypi.local 'sudo systemctl restart signalk'
```

## Security Notes

- The script uses `sudo` commands on the Pi for file operations
- Ensure your Pi has proper security (change default passwords, use SSH keys, etc.)
- Consider using SSH keys instead of password authentication
- Review firewall settings if SignalK web interface isn't accessible

## Updates

To update the plugin after making changes:

1. Make changes to source files
2. Run `npm run build`
3. Run `./deploy_to_pi.sh` again

The script will efficiently update only changed files and restart services as needed. 