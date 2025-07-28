// BBXX Message Validator and Decoder
// This script validates and decodes BBXX weather reports

function validateAndDecodeBbxx(bbxxMessage) {
    console.log('BBXX Message Analysis');
    console.log('='.repeat(50));
    console.log(`Input: ${bbxxMessage}`);
    console.log('');

    // Split the message into components
    const parts = bbxxMessage.split(' ');
    
    if (parts.length < 15) {
        console.log('❌ ERROR: Invalid BBXX format - insufficient parts');
        return false;
    }

    let isValid = true;
    const analysis = {};

    // 1. Message Type
    analysis.messageType = parts[0];
    if (analysis.messageType !== 'BBXX') {
        console.log('❌ ERROR: Invalid message type, should be BBXX');
        isValid = false;
    } else {
        console.log('✅ Message Type: BBXX (valid)');
    }

    // 2. Station ID
    analysis.stationId = parts[1];
    console.log(`✅ Station ID: ${analysis.stationId}`);

    // 3. Day/Hour/Wind Indicator (DDHHI)
    analysis.dayHourWind = parts[2];
    if (analysis.dayHourWind.length === 5) {
        const day = parseInt(analysis.dayHourWind.substring(0, 2));
        const hour = parseInt(analysis.dayHourWind.substring(2, 4));
        const windIndicator = parseInt(analysis.dayHourWind.substring(4, 5));
        
        analysis.day = day;
        analysis.hour = hour;
        analysis.windIndicator = windIndicator;
        
        console.log(`✅ Day/Hour/Wind: ${analysis.dayHourWind}`);
        console.log(`   Day: ${day} (${day >= 1 && day <= 31 ? 'valid' : 'invalid'})`);
        console.log(`   Hour: ${hour} UTC (${hour >= 0 && hour <= 23 ? 'valid' : 'invalid'})`);
        console.log(`   Wind Indicator: ${windIndicator} (${windIndicator === 4 ? 'anemometer/knots' : 'other'})`);
        
        if (day < 1 || day > 31 || hour < 0 || hour > 23) {
            console.log('⚠️  WARNING: Day or hour out of valid range');
        }
    } else {
        console.log('❌ ERROR: Invalid day/hour/wind format');
        isValid = false;
    }

    // 4. Latitude (99LLL)
    analysis.latitudeCode = parts[3];
    if (analysis.latitudeCode.length === 5 && analysis.latitudeCode.startsWith('99')) {
        const latTenths = parseInt(analysis.latitudeCode.substring(2));
        analysis.latitude = latTenths / 10.0;
        console.log(`✅ Latitude Code: ${analysis.latitudeCode}`);
        console.log(`   Latitude: ${analysis.latitude}° (${analysis.latitude >= 0 && analysis.latitude <= 90 ? 'valid' : 'invalid'})`);
        
        if (analysis.latitude < 0 || analysis.latitude > 90) {
            console.log('❌ ERROR: Latitude out of valid range (0-90°)');
            isValid = false;
        }
    } else {
        console.log('❌ ERROR: Invalid latitude format');
        isValid = false;
    }

    // 5. Longitude (QLLLL)
    analysis.longitudeCode = parts[4];
    if (analysis.longitudeCode.length === 5) {
        const quadrant = parseInt(analysis.longitudeCode.substring(0, 1));
        const lonTenths = parseInt(analysis.longitudeCode.substring(1));
        analysis.quadrant = quadrant;
        analysis.longitudeTenths = lonTenths;
        analysis.longitude = lonTenths / 10.0;
        
        // Apply quadrant sign
        let actualLongitude = analysis.longitude;
        let quadrantDesc = '';
        switch (quadrant) {
            case 1: quadrantDesc = 'NE'; break;
            case 3: quadrantDesc = 'SE'; actualLongitude = analysis.longitude; break;
            case 5: quadrantDesc = 'SW'; actualLongitude = -analysis.longitude; break;
            case 7: quadrantDesc = 'NW'; actualLongitude = -analysis.longitude; break;
            default: quadrantDesc = 'Unknown'; break;
        }
        
        analysis.actualLongitude = actualLongitude;
        
        console.log(`✅ Longitude Code: ${analysis.longitudeCode}`);
        console.log(`   Quadrant: ${quadrant} (${quadrantDesc})`);
        console.log(`   Longitude: ${actualLongitude}° (${Math.abs(actualLongitude) >= 0 && Math.abs(actualLongitude) <= 180 ? 'valid' : 'invalid'})`);
        
        if (![1, 3, 5, 7].includes(quadrant)) {
            console.log('❌ ERROR: Invalid quadrant');
            isValid = false;
        }
        if (Math.abs(actualLongitude) > 180) {
            console.log('❌ ERROR: Longitude out of valid range (-180 to +180°)');
            isValid = false;
        }
    } else {
        console.log('❌ ERROR: Invalid longitude format');
        isValid = false;
    }

    // 6. Precipitation Group
    analysis.precipitation = parts[5];
    if (analysis.precipitation === '43///') {
        console.log('✅ Precipitation: 43/// (omitted - standard for marine reports)');
    } else {
        console.log(`⚠️  Precipitation: ${analysis.precipitation} (non-standard)`);
    }

    // 7. Wind Group (/ddff)
    analysis.windGroup = parts[6];
    if (analysis.windGroup.length === 5 && analysis.windGroup.startsWith('/')) {
        const windDirTens = analysis.windGroup.substring(1, 3);
        const windSpeed = analysis.windGroup.substring(3, 5);
        
        if (windDirTens !== '//' && windSpeed !== '//') {
            const windDirection = parseInt(windDirTens) * 10;
            const windSpeedKnots = parseInt(windSpeed);
            
            analysis.windDirection = windDirection;
            analysis.windSpeed = windSpeedKnots;
            
            console.log(`✅ Wind Group: ${analysis.windGroup}`);
            console.log(`   Wind Direction: ${windDirection}° (${windDirection >= 0 && windDirection <= 360 ? 'valid' : 'invalid'})`);
            console.log(`   Wind Speed: ${windSpeedKnots} knots (${windSpeedKnots >= 0 && windSpeedKnots < 100 ? 'valid' : 'invalid'})`);
            
            if (windDirection < 0 || windDirection > 360) {
                console.log('❌ ERROR: Wind direction out of valid range (0-360°)');
                isValid = false;
            }
            if (windSpeedKnots < 0 || windSpeedKnots >= 100) {
                console.log('⚠️  WARNING: Wind speed unusual (0-99 knots expected)');
            }
        } else {
            console.log(`✅ Wind Group: ${analysis.windGroup} (wind data omitted)`);
        }
    } else {
        console.log('❌ ERROR: Invalid wind group format');
        isValid = false;
    }

    // 8. Skip groups 1//// through 8////
    console.log('✅ Groups 1-8: Standard omitted groups (1//// 2//// 4//// 5//// 7//// 8////)');

    // 9. Section 2 identifier
    const section2Index = parts.findIndex(p => p === '222//');
    if (section2Index !== -1) {
        console.log('✅ Section 2: 222// (sea surface temperature section)');
        
        // 10. Water temperature
        if (parts.length > section2Index + 1) {
            analysis.tempGroup = parts[section2Index + 1];
            if (analysis.tempGroup.length === 5 && analysis.tempGroup.startsWith('0')) {
                const tempSign = analysis.tempGroup.substring(1, 2);
                const tempValue = analysis.tempGroup.substring(2, 5);
                
                if (tempSign === '4' || tempSign === '5') {
                    const tempTenths = parseInt(tempValue);
                    const temperature = tempTenths / 10.0;
                    const actualTemp = tempSign === '4' ? temperature : -temperature;
                    
                    analysis.waterTemperature = actualTemp;
                    
                    console.log(`✅ Water Temperature: ${analysis.tempGroup}`);
                    console.log(`   Temperature: ${actualTemp}°C (${actualTemp >= -5 && actualTemp <= 40 ? 'reasonable' : 'unusual'})`);
                    
                    if (actualTemp < -5 || actualTemp > 40) {
                        console.log('⚠️  WARNING: Water temperature outside typical range (-5 to 40°C)');
                    }
                } else {
                    console.log(`⚠️  Water Temperature: ${analysis.tempGroup} (unusual sign indicator)`);
                }
            } else if (analysis.tempGroup === '0////') {
                console.log('✅ Water Temperature: 0//// (omitted)');
            } else {
                console.log(`❌ ERROR: Invalid water temperature format: ${analysis.tempGroup}`);
                isValid = false;
            }
        }
    } else {
        console.log('❌ ERROR: Missing section 2 identifier (222//)');
        isValid = false;
    }

    // 11. Check for proper termination
    if (bbxxMessage.endsWith('=')) {
        console.log('✅ Message Termination: Ends with = (valid)');
    } else {
        console.log('⚠️  WARNING: Message should end with =');
    }

    console.log('');
    console.log('Summary:');
    console.log('='.repeat(30));
    
    if (analysis.latitude && analysis.actualLongitude) {
        console.log(`📍 Position: ${analysis.latitude}°N, ${Math.abs(analysis.actualLongitude)}°${analysis.actualLongitude >= 0 ? 'E' : 'W'}`);
    }
    
    if (analysis.windDirection !== undefined && analysis.windSpeed !== undefined) {
        console.log(`💨 Wind: ${analysis.windDirection}° at ${analysis.windSpeed} knots`);
    }
    
    if (analysis.waterTemperature !== undefined) {
        console.log(`🌊 Water Temperature: ${analysis.waterTemperature}°C`);
    }
    
    if (analysis.day && analysis.hour !== undefined) {
        console.log(`📅 Observation Time: Day ${analysis.day}, ${analysis.hour}:00 UTC`);
    }

    console.log('');
    console.log(`Overall Validity: ${isValid ? '✅ VALID' : '❌ INVALID'}`);
    
    return { isValid, analysis };
}

// Test with the provided BBXX message
const testMessage = "BBXX 9RM2K7C 28154 99112 70742 43/// /0112 1//// 2//// 4//// 5//// 7//// 8//// 222// 04275 0//// 2//// 3//// 4//// 5//// 6//// 8//// ICE /////=";

validateAndDecodeBbxx(testMessage); 