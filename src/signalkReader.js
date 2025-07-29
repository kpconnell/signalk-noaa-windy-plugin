const axios = require('axios');
const { generateBbxxReport } = require('./weatherReport');

// Utility functions
function mpsToKnots(mps) {
    return mps !== null && mps !== undefined ? mps * 1.94384 : null;
}

function radiansToDegrees(rad) {
    return rad !== null && rad !== undefined ? (rad * 180) / Math.PI : null;
}

function getSignalkValue(data, ...path) {
    let current = data;
    for (const p of path) {
        if (current && typeof current === 'object' && p in current) {
            current = current[p];
        } else {
            return null;
        }
    }
    return current;
}

function extractValue(val) {
    if (val && typeof val === 'object') {
        // Try common keys
        for (const k of ['value', 'doubleValue', 'number', 'val']) {
            if (k in val && (typeof val[k] === 'number')) {
                return val[k];
            }
        }
        // If dict has only one key and it's a number, use it
        const keys = Object.keys(val);
        if (keys.length === 1) {
            const v = val[keys[0]];
            if (typeof v === 'number') {
                return v;
            }
        }
        return null;
    }
    return val;
}

function averageAngles(angles) {
    if (!angles || angles.length === 0 || angles.some(angle => angle === null || angle === undefined)) {
        return null;
    }
    
    // Convert to radians and calculate mean
    const radAngles = angles.map(angle => (angle * Math.PI) / 180);
    const meanSin = radAngles.reduce((sum, angle) => sum + Math.sin(angle), 0) / radAngles.length;
    const meanCos = radAngles.reduce((sum, angle) => sum + Math.cos(angle), 0) / radAngles.length;
    
    // Convert back to degrees
    const meanAngle = (Math.atan2(meanSin, meanCos) * 180) / Math.PI;
    return ((meanAngle % 360) + 360) % 360;
}

function calculateTrueWind(awa, aws, trueHeading, sog) {
    if (awa === null || aws === null || trueHeading === null || sog === null) {
        return [null, null];
    }
    
    // Convert to radians
    const awaRad = (awa * Math.PI) / 180;
    const headingRad = (trueHeading * Math.PI) / 180;
    
    // Calculate true wind direction
    const twDirRad = headingRad + awaRad;
    let twDir = (twDirRad * 180) / Math.PI;
    
    // Normalize to 0-360
    twDir = ((twDir % 360) + 360) % 360;
    
    // Calculate true wind speed using vector math
    const twSpeed = Math.sqrt(aws * aws + sog * sog - 2 * aws * sog * Math.cos(awaRad));
    
    return [twDir, twSpeed];
}

async function collectSample(app) {
    const sample = {};
    
    try {
        // Get navigation data using SignalK app getSelfPath
        sample.heading_rad = app.getSelfPath('navigation.headingMagnetic.value');
        sample.heading_true_rad = app.getSelfPath('navigation.headingTrue.value');
        sample.magnetic_variation_rad = app.getSelfPath('navigation.magneticVariation.value');
        sample.sog_mps = app.getSelfPath('navigation.speedOverGround.value');
        
        // Get position
        sample.lat = app.getSelfPath('navigation.position.value.latitude');
        sample.lon = app.getSelfPath('navigation.position.value.longitude');
        
        // Get apparent wind
        sample.awa_rad = app.getSelfPath('environment.wind.angleApparent.value');
        sample.aws_mps = app.getSelfPath('environment.wind.speedApparent.value');
        
        // Get water temperature
        let waterTempKelvin = app.getSelfPath('environment.water.temperature.value');
        if (waterTempKelvin !== null && waterTempKelvin > 200) { // Likely Kelvin
            sample.water_temp = waterTempKelvin - 273.15;
        } else {
            sample.water_temp = waterTempKelvin;
        }
        
    } catch (error) {
        console.error(`Error collecting sample: ${error.message}`);
        return null;
    }
    
    // Convert units
    sample.awa = radiansToDegrees(sample.awa_rad);
    sample.aws = mpsToKnots(sample.aws_mps);
    sample.heading_deg = radiansToDegrees(sample.heading_rad);
    sample.heading_true_deg = radiansToDegrees(sample.heading_true_rad);
    sample.magnetic_variation_deg = radiansToDegrees(sample.magnetic_variation_rad);
    
    // Try different heading sources
    if (sample.heading_true_deg !== null) {
        sample.true_heading_deg = sample.heading_true_deg;
    } else if (sample.heading_deg !== null) {
        sample.true_heading_deg = sample.heading_deg;
    } else {
        sample.true_heading_deg = null;
    }
    
    sample.sog_knots = mpsToKnots(sample.sog_mps);
    
    // Calculate true wind for this sample
    if (sample.awa !== null && sample.aws !== null && sample.true_heading_deg !== null && sample.sog_knots !== null) {
        const [twDir, twSpeed] = calculateTrueWind(sample.awa, sample.aws, sample.true_heading_deg, sample.sog_knots);
        sample.true_wind_dir = twDir;
        sample.true_wind_speed = twSpeed;
    } else {
        sample.true_wind_dir = null;
        sample.true_wind_speed = null;
        
        // Log what's missing for true wind calculation
        const missingForWind = [];
        if (sample.awa === null) missingForWind.push('apparent wind angle');
        if (sample.aws === null) missingForWind.push('apparent wind speed');
        if (sample.true_heading_deg === null) missingForWind.push('heading');
        if (sample.sog_knots === null) missingForWind.push('speed over ground');
        
        console.debug(`Sample missing data for true wind calculation: ${missingForWind.join(', ')}`);
    }
    
    return sample;
}

function averageSamples(samples) {
    if (!samples || samples.length === 0) {
        return null;
    }
    
    // Filter out null values for each field
    const validSamples = samples.filter(s => s !== null);
    if (validSamples.length === 0) {
        return null;
    }
    
    const avg = {};
    
    // Average numeric fields
    const numericFields = ['sog_knots', 'water_temp', 'aws'];
    for (const field of numericFields) {
        const values = validSamples.map(s => s[field]).filter(v => v !== null);
        if (values.length > 0) {
            avg[field] = values.reduce((sum, val) => sum + val, 0) / values.length;
        } else {
            avg[field] = null;
        }
    }
    
    // Average angle fields (handling wrap-around)
    const angleFields = ['heading_deg', 'magnetic_variation_deg', 'true_heading_deg', 'awa', 'true_wind_dir'];
    for (const field of angleFields) {
        const values = validSamples.map(s => s[field]).filter(v => v !== null);
        if (values.length > 0) {
            avg[field] = averageAngles(values);
        } else {
            avg[field] = null;
        }
    }
    
    // Average true wind speed
    const twSpeeds = validSamples.map(s => s.true_wind_speed).filter(v => v !== null);
    if (twSpeeds.length > 0) {
        avg.true_wind_speed = twSpeeds.reduce((sum, val) => sum + val, 0) / twSpeeds.length;
    } else {
        avg.true_wind_speed = null;
    }
    
    // Use the most recent position (should be stable)
    avg.lat = validSamples[validSamples.length - 1].lat;
    avg.lon = validSamples[validSamples.length - 1].lon;
    
    return avg;
}

async function collectSignalkData(app, samples = 3, interval = 5, stationId = 'UNKNOWN') {
    console.log(`Collecting ${samples} Signal K samples with ${interval} second intervals...`);
    
    try {
        const collectedSamples = [];
        
        for (let i = 0; i < samples; i++) {
            console.log(`Collecting sample ${i + 1}/${samples}...`);
            const sample = await collectSample(app);
            
            if (sample === null) {
                console.warn(`Sample ${i + 1} failed to collect - skipping...`);
                continue;
            }
            
            collectedSamples.push(sample);
            
            // Log sample values
            if (sample.true_wind_dir !== null) {
                console.log(`  Sample ${i + 1} heading: ${sample.heading_rad?.toFixed(4)} rad = ${sample.heading_deg?.toFixed(1)}°`);
                console.log(`  Sample ${i + 1} apparent wind: ${sample.awa?.toFixed(1)}° at ${sample.aws_mps?.toFixed(1)} m/s (${sample.aws?.toFixed(1)} knots)`);
                console.log(`  Sample ${i + 1} true wind: ${sample.true_wind_dir?.toFixed(1)}° at ${sample.true_wind_speed?.toFixed(1)} knots`);
            }
            
            // Wait before next sample (except for the last one)
            if (i < samples - 1) {
                await new Promise(resolve => setTimeout(resolve, interval * 1000));
            }
        }
        
        if (collectedSamples.length === 0) {
            console.error("No valid samples collected!");
            return null;
        }
        
        // Log data availability summary
        console.log(`\nData collection summary: ${collectedSamples.length}/${samples} samples collected`);
        const firstSample = collectedSamples[0];
        const dataStatus = {
            position: !!(firstSample.lat !== null && firstSample.lon !== null),
            heading: !!(firstSample.true_heading_deg !== null),
            wind: !!(firstSample.true_wind_dir !== null && firstSample.true_wind_speed !== null),
            speed: !!(firstSample.sog_knots !== null),
            waterTemp: !!(firstSample.water_temp !== null)
        };
        
        const availableData = Object.entries(dataStatus)
            .filter(([key, available]) => available)
            .map(([key]) => key);
        const missingData = Object.entries(dataStatus)
            .filter(([key, available]) => !available)
            .map(([key]) => key);
            
        console.log(`Available data: ${availableData.join(', ')}`);
        if (missingData.length > 0) {
            console.log(`Missing data: ${missingData.join(', ')}`);
        }
        
        console.log(`Averaging ${collectedSamples.length} samples...`);
        const avgData = averageSamples(collectedSamples);
        
        if (avgData === null) {
            console.error("Failed to average samples!");
            return null;
        }
        
        // Add timestamp and BBXX report
        avgData.utc_time = new Date();
        
        // Check data completeness and provide detailed error messages
        const missingData = [];
        if (avgData.lat === null || avgData.lon === null) missingData.push('position (lat/lon)');
        if (avgData.true_heading_deg === null) missingData.push('heading');
        if (avgData.true_wind_dir === null || avgData.true_wind_speed === null) missingData.push('wind (direction/speed)');
        if (avgData.sog_knots === null) missingData.push('speed over ground');
        
        if (missingData.length > 0) {
            console.error(`Missing required data for BBXX report generation: ${missingData.join(', ')}`);
            return null;
        }
        
        // Generate BBXX report
        const bbxx = generateBbxxReport(
            avgData.true_wind_dir,
            avgData.true_wind_speed,
            avgData.lat,
            avgData.lon,
            avgData.utc_time,
            stationId,
            avgData.water_temp
        );
        avgData.bbxx = bbxx;
        
        return avgData;
    } catch (error) {
        console.error(`Error collecting SignalK data: ${error.message}`);
        return null;
    }
}

function displaySignalkSummary(data) {
    if (!data) {
        console.error("No data to display.");
        return;
    }
    
    console.log("\nSignal K Weather Summary:");
    console.log("=".repeat(50));
    console.log(`Position: ${data.lat?.toFixed(6)}, ${data.lon?.toFixed(6)}`);
    console.log(`True Heading: ${data.true_heading_deg?.toFixed(1)}°`);
    console.log(`SOG: ${data.sog_knots?.toFixed(2)} knots`);
    console.log(`Apparent Wind: ${data.awa?.toFixed(1)}° at ${data.aws?.toFixed(1)} knots`);
    console.log(`True Wind: ${data.true_wind_dir?.toFixed(1)}° at ${data.true_wind_speed?.toFixed(1)} knots`);
    if (data.water_temp !== null) {
        console.log(`Water Temp: ${data.water_temp?.toFixed(1)}°C`);
    }
    console.log(`Time: ${data.utc_time.toISOString().slice(11, 19)} UTC`);
    
    console.log("\nBBXX Report:");
    console.log(data.bbxx);
}

async function sendSignalkData(data, testMode = true, stationId = 'UNKNOWN') {
    if (!data || !data.bbxx) {
        console.error("No data to send.");
        return;
    }
    
    const formData = {
        'ship': stationId,
        'lat': data.lat?.toFixed(6),
        'lon': data.lon?.toFixed(6),
        'entry.354542700': data.bbxx,
        'entry.1226456580': 'TRUE',
    };
    
    if (testMode) {
        console.log("\nBBXX data for NOAA submission (test mode, not posted):");
        console.log("Reference: https://www.vos.noaa.gov/ObsHB-508/ObservingHandbook1_2010_508_compliant.pdf");
        for (const [k, v] of Object.entries(formData)) {
            console.log(`  ${k}: ${v}`);
        }
    } else {
        const url = "https://docs.google.com/forms/d/e/1FAIpQLSfox4aMFCWmDmAaBYOhqlQoRpCyXuaUSTB7JB93qIaqVqreQg/formResponse";
        try {
            const response = await axios.post(url, formData);
            console.log(`NOAA submission POST status code: ${response.status}`);
        } catch (error) {
            console.error(`Error posting to NOAA: ${error.message}`);
        }
    }
}

module.exports = {
    collectSignalkData,
    displaySignalkSummary,
    sendSignalkData
}; 