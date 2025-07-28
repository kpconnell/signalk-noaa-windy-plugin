# WX NMEA SignalK Plugin

A SignalK plugin that collects marine weather data and generates BBXX weather reports for submission to weather services.

## Features

- **SignalK Integration**: Collects data directly from SignalK server
- **Data Averaging**: Samples multiple data points for improved accuracy
- **BBXX Report Generation**: Creates standardized marine weather reports
- **NOAA Integration**: Automatic submission of weather reports to NOAA
- **Web Interface**: Built-in web UI for manual report generation and status monitoring
- **Comprehensive Logging**: Winston-based logging with daily rotation
- **Configurable Intervals**: Flexible sampling and reporting schedules

## Installation

### Development Installation

1. Clone or download the plugin to your SignalK server's node_modules directory:
   ```bash
   cd ~/.signalk/node_modules
   git clone <repository-url> noaa-vos-signalk-plugin
cd noaa-vos-signalk-plugin
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the plugin:
   ```bash
   npm run build
   ```

4. Link for development (optional):
   ```bash
   npm link
   ```

5. Restart your SignalK server

### Production Installation

Install directly through the SignalK App Store or via npm:
```bash
npm install signalk-noaa-weather-report
```

## Configuration

The plugin can be configured through the SignalK server admin interface under Server → Plugin Config → NOAA / Windy Ship Reporting Plugin.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| **Ship Station Callsign** | String | *Required* | You must register with the FCC or ITU and provide a valid Ship's Station Callsign. |
| **Test Mode** | Boolean | true | When enabled, BBXX data is logged but not sent to NOAA. Disable to send BBXX reports to NOAA. |

### Default Settings

The plugin uses these hardcoded defaults for optimal performance:
- **Number of samples**: 3 (for accuracy)
- **Sample interval**: 5 seconds (between samples)
- **Log level**: info (standard logging)

## Usage

### Web Interface

Access the plugin's web interface at:
`http://your-signalk-server:3000/plugins/noaa-vos-signalk-plugin/`

The interface provides:
- Plugin status indicator
- Manual report generation button
- Display of the last generated report
- Human-readable and BBXX format reports

### API Endpoints

#### GET `/plugins/noaa-vos-signalk-plugin/status`
Returns plugin status and last report data.

**Response:**
```json
{
  "pluginStarted": true,
  "lastReport": {
    "timestamp": "2024-01-15T14:30:00.000Z",
    "position": {
      "lat": 28.144,
      "lon": -112.742
    },
    "trueWind": {
      "direction": 270.5,
      "speed": 15.2
    },
    "bbxx": "BBXX WXH9553 15144 99281 71127 43/// /2715 1//// 2//// 4//// 5//// 7//// 8//// 222// 04225 0//// 2//// 3//// 4//// 5//// 6//// 8//// ICE /////=",
    "humanReadable": "UTC: 2024-01-15 14:30\n  Position: 28.144000, -112.742000\n           28°08.640'N, 112°44.520'W\n  True Wind: 270.5° 15.20 knots"
  }
}
```

#### POST `/plugins/noaa-vos-signalk-plugin/generate-report`
Manually generate a new weather report.

**Response:**
```json
{
  "success": true,
  "report": {
    // Same structure as lastReport above
  }
}
```

### Operation

The plugin operates in manual mode only. To generate a weather report:
1. Use the web interface "Generate Report" button, or
2. Make a POST request to the `/generate-report` API endpoint

Each report generation will:
1. Collect 3 samples at 5-second intervals
2. Average the data for accuracy
3. Generate a BBXX weather report
4. Submit to NOAA (unless Test Mode is enabled)
5. Log the results

## Data Collection

The plugin collects the following data from SignalK:

### Navigation Data
- **Position**: `navigation.position.value.latitude/longitude`
- **Heading**: `navigation.headingTrue.value` or `navigation.headingMagnetic.value`
- **Speed Over Ground**: `navigation.speedOverGround.value`
- **Magnetic Variation**: `navigation.magneticVariation.value`

### Environmental Data
- **Apparent Wind Angle**: `environment.wind.angleApparent.value`
- **Apparent Wind Speed**: `environment.wind.speedApparent.value`
- **Water Temperature**: `environment.water.temperature.value`

### Data Processing
- Multiple samples are collected and averaged for accuracy
- Angular data (wind direction, heading) uses circular averaging
- True wind is calculated from apparent wind, heading, and speed over ground
- Units are converted to standard marine formats (knots, degrees)

## BBXX Weather Reports

The plugin generates BBXX format weather reports following WMO standards for marine weather observations. For complete details on the BBXX format, see the [NOAA VOS Observing Handbook](https://www.vos.noaa.gov/ObsHB-508/ObservingHandbook1_2010_508_compliant.pdf).

```
BBXX WXH9553 15144 99281 71127 43/// /2715 1//// 2//// 4//// 5//// 7//// 8//// 222// 04225 0//// 2//// 3//// 4//// 5//// 6//// 8//// ICE /////=
```

### BBXX Format Breakdown
- **BBXX**: Report type identifier
- **WXH9553**: Station identifier
- **15144**: Day (15) + Hour (14) + Wind indicator (4)
- **99281**: Latitude code (99 + 281 tenths)
- **71127**: Quadrant (7) + Longitude (1127 tenths)
- **43///**: Precipitation group (omitted)
- **/2715**: Cloud/wind group (direction 270°, speed 15 knots)
- **222//**: Section identifier
- **04225**: Water temperature (22.5°C)

## NOAA Integration

The plugin submits BBXX weather reports to NOAA's Voluntary Observing Ships (VOS) program. The VOS program collects marine meteorological observations from ships worldwide to support weather forecasting and climate research.

### NOAA VOS Program
NOAA's VOS program has been collecting marine weather observations since the 1850s. These observations are crucial for:
- Weather forecasting and warnings
- Climate monitoring and research
- Maritime safety
- Ocean and atmospheric modeling

For detailed information about marine weather observations and the BBXX format, see the [NOAA VOS Observing Handbook](https://www.vos.noaa.gov/ObsHB-508/ObservingHandbook1_2010_508_compliant.pdf).

### Ship Station Callsign Registration
To participate in the VOS program, you must obtain a valid Ship's Station Callsign:

**United States vessels:**
- Register with the FCC (Federal Communications Commission)
- Apply for a Ship Station License
- You will receive a unique callsign (e.g., WXH9553)

**International vessels:**
- Register with your national telecommunications authority
- Follow ITU (International Telecommunication Union) procedures
- Obtain an internationally recognized callsign

### Test Mode
When test mode is enabled (default), BBXX data is logged but not actually submitted to NOAA, allowing you to verify the data format before contributing to the VOS program.

## Logging

The plugin uses Winston for comprehensive logging with:
- Console output for real-time monitoring
- Daily rotating log files in `logs/noaa-vos-YYYY-MM-DD.log`
- Configurable log levels (error, warn, info, debug)
- 7-day log retention

## Development

### Testing
Run the test suite to verify functionality:
```bash
npm test
```

### Building
Copy source files to the plugin directory:
```bash
npm run build
```

### Development Workflow
1. Make changes to files in `src/`
2. Run `npm run build` to copy to `plugin/`
3. Restart SignalK server to reload plugin
4. Test functionality through web interface

## Troubleshooting

### Common Issues

**Plugin not starting:**
- Check SignalK server logs for error messages
- Verify all dependencies are installed (`npm install`)
- Ensure plugin is built (`npm run build`)

**No data collected:**
- Verify SignalK server has required data paths
- Check plugin logs for data collection errors
- Ensure boat instruments are providing data to SignalK

**BBXX reports look incorrect:**
- Run test suite to verify report generation
- Check that position and wind data are valid
- Verify time zone settings (reports use UTC)

**NOAA submissions failing:**
- Check network connectivity
- Verify BBXX data format is correct
- Test with test mode enabled first

### Debug Mode
Enable debug logging in plugin configuration to see detailed data collection and processing information.

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## Support

For issues and questions:
- Check the troubleshooting section above
- Review SignalK server logs
- Create an issue in the project repository 