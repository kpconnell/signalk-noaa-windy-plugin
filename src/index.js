const axios = require('axios');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const { collectSignalkData, displaySignalkSummary, sendSignalkData } = require('./signalkReader');
const { humanReadableReport } = require('./weatherReport');

module.exports = function(app) {
    let logger;
    let intervalId = null;
    let lastReport = null;
    let pluginStarted = false;
    let lastError = null;
    let lastErrorTime = null;

    const plugin = {
        id: 'signalk-noaa-weather-report',
        name: 'NOAA / Windy Ship Reporting Plugin',
        description: 'Collects marine weather data from SignalK and generates BBXX weather reports for NOAA and Windy',

        schema: {
            type: 'object',
            required: ['stationId'],
            properties: {
                stationId: {
                    type: 'string',
                    title: 'Ship Station Callsign',
                    description: 'You must register with the FCC or ITU and provide a valid Ship\'s Station Callsign.',
                    minLength: 3,
                    maxLength: 10
                },
                betaKey: {
                    type: 'string',
                    title: 'Beta Key',
                    description: 'Beta access key required to send reports to NOAA. Without this key, only test mode is available. Email kevin@connells.net for access.',
                    minLength: 0,
                    maxLength: 50
                },
                testMode: {
                    type: 'boolean',
                    title: 'Test Mode',
                    default: true
                },
                samples: {
                    type: 'number',
                    title: 'Number of Samples',
                    description: 'Number of data samples to average for each report (1-10).',
                    minimum: 1,
                    maximum: 10,
                    default: 3
                },
                interval: {
                    type: 'number',
                    title: 'Sampling Interval (seconds)',
                    description: 'Time between data samples in seconds (1-60).',
                    minimum: 1,
                    maximum: 60,
                    default: 5
                },
                reportInterval: {
                    type: 'number',
                    title: 'Automatic Report Interval (hours)',
                    description: 'Hours between automatic reports (0 = manual only, 1-24).',
                    minimum: 0,
                    maximum: 24,
                    default: 0
                },
                logLevel: {
                    type: 'string',
                    title: 'Log Level',
                    description: 'Logging detail level.',
                    enum: ['error', 'warn', 'info', 'debug'],
                    default: 'info'
                }
            }
        },

        uiSchema: {
            stationId: {
                'ui:widget': 'text',
                'ui:placeholder': 'Enter your ship station callsign (e.g., 9RM2K7C)'
            },
            betaKey: {
                'ui:widget': 'password',
                'ui:placeholder': 'Email kevin@connells.net for beta key access'
            },
            testMode: {
                'ui:widget': 'checkbox',
                'ui:help': 'Reports are logged locally in test mode and not sent to NOAA.'
            },
            samples: {
                'ui:widget': 'updown'
            },
            interval: {
                'ui:widget': 'updown'
            },
            reportInterval: {
                'ui:widget': 'updown'
            },
            logLevel: {
                'ui:widget': 'select'
            }
        },

        statusMessage: function() {
            if (!pluginStarted) {
                return 'Plugin not started';
            }
            
            if (lastReport) {
                const timestamp = lastReport.utc_time.toISOString().slice(11, 19); // Just HH:MM:SS
                const tws = lastReport.true_wind_speed ? `${lastReport.true_wind_speed.toFixed(1)}` : 'N/A';
                const twd = lastReport.true_wind_dir ? `${lastReport.true_wind_dir.toFixed(0)}°` : 'N/A';
                return `${timestamp} ${tws}kts ${twd}`;
            }
            
            // Show recent error if within last 5 minutes
            if (lastError && lastErrorTime) {
                const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
                if (lastErrorTime > fiveMinutesAgo) {
                    const errorTime = new Date(lastErrorTime).toISOString().slice(11, 19);
                    // Use "ERROR" prefix to trigger red status in SignalK dashboard
                    return `ERROR: ${lastError}`;
                }
            }
            
            return 'Waiting for data...';
        },

        // Add status property for SignalK dashboard color indication
        get status() {
            if (!pluginStarted) {
                return 'stopped';
            }
            
            if (lastError && lastErrorTime) {
                const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
                if (lastErrorTime > fiveMinutesAgo) {
                    return 'error';
                }
            }
            
            if (lastReport) {
                return 'active';
            }
            
            return 'waiting';
        },

        start: function(options) {
            if (pluginStarted) {
                return;
            }

            // Setup logging
            const logTransports = [
                new winston.transports.Console({
                    level: 'info',
                    format: winston.format.combine(
                        winston.format.timestamp(),
                        winston.format.printf(({ timestamp, level, message }) => {
                            return `${timestamp} [noaa-vos] ${level}: ${message}`;
                        })
                    )
                }),
                new DailyRotateFile({
                    filename: 'logs/noaa-vos-%DATE%.log',
                    datePattern: 'YYYY-MM-DD',
                    maxFiles: '7d',
                    level: 'info',
                    format: winston.format.combine(
                        winston.format.timestamp(),
                        winston.format.printf(({ timestamp, level, message }) => {
                            return `${timestamp} [noaa-vos] ${level}: ${message}`;
                        })
                    )
                })
            ];

            logger = winston.createLogger({
                transports: logTransports
            });

            logger.info('NOAA / Windy Ship Reporting Plugin starting...');
            logger.info(`Test Mode: ${options.testMode ? 'ON (reports logged only)' : 'OFF (reports sent to NOAA)'}`);

            pluginStarted = true;
            app.setPluginStatus('Plugin started - waiting for data...');

            // Handle automatic reporting if interval is set
            if (options.reportInterval && options.reportInterval > 0) {
                logger.info(`Automatic reporting enabled - interval: ${options.reportInterval} hours`);
                
                // Send initial report after 2 minutes
                logger.info('Setting up initial report timer (2 minutes)...');
                setTimeout(async () => {
                    logger.info('Initial report timer fired - checking plugin state...');
                    if (pluginStarted) {
                        logger.info('Plugin is still running - sending initial weather report...');
                        try {
                            await generateReport(options);
                            logger.info('Initial weather report sent successfully');
                            // Clear any previous errors on success
                            lastError = null;
                            lastErrorTime = null;
                            app.setPluginStatus('Initial weather report sent successfully');
                        } catch (error) {
                            const errorMsg = `Failed to send initial weather report: ${error.message}`;
                            logger.error(errorMsg);
                            lastError = errorMsg;
                            lastErrorTime = Date.now();
                            app.setPluginError(errorMsg);
                        }
                    } else {
                        logger.warn('Plugin is no longer running - skipping initial report');
                    }
                }, 2 * 60 * 1000); // 2 minutes

                // Set up recurring reports
                const intervalMs = options.reportInterval * 60 * 60 * 1000; // Convert hours to milliseconds
                intervalId = setInterval(async () => {
                    if (pluginStarted) {
                        logger.info(`Sending scheduled weather report (every ${options.reportInterval} hours)...`);
                        try {
                            await generateReport(options);
                            logger.info('Scheduled weather report sent successfully');
                            // Clear any previous errors on success
                            lastError = null;
                            lastErrorTime = null;
                            app.setPluginStatus('Scheduled weather report sent successfully');
                        } catch (error) {
                            const errorMsg = `Failed to send scheduled weather report: ${error.message}`;
                            logger.error(errorMsg);
                            lastError = errorMsg;
                            lastErrorTime = Date.now();
                            app.setPluginError(errorMsg);
                        }
                    }
                }, intervalMs);
                
                logger.info(`Next scheduled report in ${options.reportInterval} hours`);
            } else {
                logger.info('Automatic reporting disabled - manual reports only');
            }

            logger.info('NOAA / Windy Ship Reporting Plugin started successfully');
        },

        stop: function() {
            if (!pluginStarted) {
                return;
            }

            if (logger) {
                logger.info('NOAA / Windy Ship Reporting Plugin stopping...');
            }

            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }

            pluginStarted = false;
            lastReport = null;

            if (logger) {
                logger.info('NOAA / Windy Ship Reporting Plugin stopped');
                logger.close();
                logger = null;
            }
        },

        registerWithRouter: function(router) {
            // Status endpoint
            router.get('/status', (req, res) => {
                const status = pluginStatus;
                let detailedStatus = status;
                
                if (lastReport) {
                    const timestamp = lastReport.utc_time.toISOString().slice(0, 19).replace('T', ' ');
                    const tws = lastReport.true_wind_speed ? `${lastReport.true_wind_speed.toFixed(1)} knots` : 'N/A';
                    detailedStatus = `${status} - Last report sent: ${timestamp}, TWS average: ${tws}`;
                }
                
                res.json({
                    pluginStarted,
                    status: detailedStatus,
                    lastReport: lastReport ? {
                        timestamp: lastReport.utc_time,
                        position: {
                            lat: lastReport.lat,
                            lon: lastReport.lon
                        },
                        trueWind: {
                            direction: lastReport.true_wind_dir,
                            speed: lastReport.true_wind_speed
                        },
                        bbxx: lastReport.bbxx,
                        humanReadable: lastReport.humanReadable
                    } : null
                });
            });

            // Manual report generation endpoint
            router.post('/generate-report', async (req, res) => {
                if (!pluginStarted) {
                    return res.status(400).json({ error: 'Plugin not started' });
                }

                try {
                    const result = await generateReport();
                    app.setPluginStatus('Manual weather report generated successfully');
                    res.json({
                        success: true,
                        report: {
                            timestamp: result.utc_time,
                            position: {
                                lat: result.lat,
                                lon: result.lon
                            },
                            trueWind: {
                                direction: result.true_wind_dir,
                                speed: result.true_wind_speed
                            },
                            bbxx: result.bbxx,
                            humanReadable: result.humanReadable
                        }
                    });
                } catch (error) {
                    const errorMsg = `Error generating manual report: ${error.message}`;
                    logger.error(errorMsg);
                    app.setPluginError(errorMsg);
                    res.status(500).json({ error: error.message });
                }
            });
        }
    };

    async function generateReport(options = {}) {
        if (!logger) {
            console.error('Logger not initialized');
            throw new Error('Logger not initialized');
        }

        logger.info('Generating weather report...');
        
        // Use configuration options with fallback defaults
        const samples = options.samples || 3;
        const interval = options.interval || 5;
        const stationId = options.stationId;
        const betaKey = options.betaKey;
        const logLevel = options.logLevel || 'info';
        
        // Hardcoded beta key for production access
        const VALID_BETA_KEY = 'NOAA-WINDY-BETA-2025-WXR7K9';
        
        // Validate beta key and determine test mode
        const validBetaKey = betaKey === VALID_BETA_KEY;
        const testMode = !validBetaKey || options.testMode !== false;
        
        if (!betaKey) {
            logger.warn('Beta key not provided - forcing test mode (reports will not be sent to NOAA)');
        } else if (!validBetaKey) {
            logger.warn('Invalid beta key provided - forcing test mode (reports will not be sent to NOAA)');
        } else if (validBetaKey && !options.testMode) {
            logger.info('Valid beta key provided - production mode enabled (reports will be sent to NOAA)');
        }
        
        if (!stationId) {
            const errorMsg = 'Station ID is required but not configured';
            logger.error(errorMsg);
            throw new Error(errorMsg);
        }

        // Collect data
        const data = await collectSignalkData(app, samples, interval, stationId);
        
        if (!data) {
            const errorMsg = 'Failed to collect weather data';
            logger.error(errorMsg);
            throw new Error(errorMsg);
        }

        // Add human readable format
        data.humanReadable = humanReadableReport(
            data.lat,
            data.lon,
            data.true_wind_dir,
            data.true_wind_speed,
            data.utc_time
        );

        // Log the summary
        displaySignalkSummary(data);
        logger.info(`Generated BBXX report: ${data.bbxx}`);

        // Send to NOAA (always attempt, testMode controls actual sending)
        await sendSignalkData(data, testMode, stationId);
        logger.info(testMode ? 'Report logged (test mode - not sent to NOAA)' : 'Report sent to NOAA');

        // Store last report
        lastReport = data;

        return data;
    }

    return plugin;
}; 