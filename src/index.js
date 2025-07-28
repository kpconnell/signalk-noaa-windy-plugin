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
                        } catch (error) {
                            logger.error(`Failed to send initial weather report: ${error.message}`);
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
                        } catch (error) {
                            logger.error(`Failed to send scheduled weather report: ${error.message}`);
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
                    res.json({
                        success: true,
                        report: result ? {
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
                        } : null
                    });
                } catch (error) {
                    logger.error(`Error generating manual report: ${error.message}`);
                    res.status(500).json({ error: error.message });
                }
            });
        }
    };

    async function generateReport(options = {}) {
        if (!logger) {
            console.error('Logger not initialized');
            return null;
        }

        try {
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
                logger.error('Station ID is required but not configured');
                return null;
            }

            // Collect data
            const data = await collectSignalkData(app, samples, interval, stationId);
            
            if (!data) {
                logger.error('Failed to collect weather data');
                return null;
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
        } catch (error) {
            logger.error(`Error generating report: ${error.message}`);
            return null;
        }
    }

    return plugin;
}; 