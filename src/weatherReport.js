// Weather Report Module for SignalK Plugin

function getBbxxQuadrant(lat, lon) {
    /**
     * Returns the BBXX quadrant code for the given latitude and longitude.
     * Quadrants:
     *   1: N/E (lat >= 0, lon >= 0)
     *   3: S/E (lat < 0, lon >= 0)
     *   5: S/W (lat < 0, lon < 0)
     *   7: N/W (lat >= 0, lon < 0)
     */
    if (lat >= 0 && lon >= 0) {
        return 1; // N/E
    } else if (lat < 0 && lon >= 0) {
        return 3; // S/E
    } else if (lat < 0 && lon < 0) {
        return 5; // S/W
    } else if (lat >= 0 && lon < 0) {
        return 7; // N/W
    } else {
        return 9; // Unknown
    }
}

function generateBbxxReport(trueWindDirection, trueWindSpeed, lat, lon, utcTime, stationId = "WXH9553", waterTemp = null) {
    /**
     * Generate a BBXX weather report from true wind direction, speed, position, and UTC time.
     * Args:
     *   trueWindDirection (number): Wind direction in degrees true
     *   trueWindSpeed (number): Wind speed in knots
     *   lat (number): Latitude in decimal degrees
     *   lon (number): Longitude in decimal degrees
     *   utcTime (Date): UTC datetime for the report
     *   stationId (string): Station identifier (default: WXH9553)
     *   waterTemp (number): Water temperature in Celsius (default: null)
     * Returns:
     *   string: BBXX weather report
     */
    
    // Day of month and hour (UTC), wind indicator 4 (anemometer, knots)
    const dayHour = `${utcTime.getUTCDate().toString().padStart(2, '0')}${utcTime.getUTCHours().toString().padStart(2, '0')}4`;
    
    // Latitude: 99 + lat in tenths, 3 digits
    const latCode = `99${Math.round(Math.abs(lat) * 10).toString().padStart(3, '0')}`;
    
    // Longitude: quadrant + lon in tenths, 4 digits
    const quadrant = getBbxxQuadrant(lat, lon);
    const lonCode = `${quadrant}${Math.round(Math.abs(lon) * 10).toString().padStart(4, '0')}`;
    
    // Precipitation group is always omitted: 43///
    const precipitationGroup = "43///";
    
    // Cloud and wind group: /ddff (cloud omitted, wind direction in tens, wind speed in knots)
    let cloudWindGroup;
    if (trueWindDirection !== null && trueWindSpeed !== null) {
        const windDirCode = Math.round(trueWindDirection / 10.0).toString().padStart(2, '0');
        const windSpeedCode = trueWindSpeed < 100 ? Math.round(trueWindSpeed).toString().padStart(2, '0') : "//";
        cloudWindGroup = `/${windDirCode}${windSpeedCode}`;
    } else {
        cloudWindGroup = "/////";
    }
    
    // Water temperature group: 0 + 4/5 for sign + 3 digits for temperature in tenths
    let tempCode;
    if (waterTemp !== null) {
        const tempAbs = Math.abs(waterTemp);
        const sign = waterTemp >= 0 ? "4" : "5";
        const tempTenths = Math.round(tempAbs * 10.0); // Convert degrees to tenths
        tempCode = `0${sign}${tempTenths.toString().padStart(3, '0')}`;
    } else {
        tempCode = "0////";
    }
    
    // Compose BBXX
    const bbxx = `BBXX ${stationId} ${dayHour} ${latCode} ${lonCode} ${precipitationGroup} ${cloudWindGroup} 1//// 2//// 4//// 5//// 7//// 8//// 222// ${tempCode} 0//// 2//// 3//// 4//// 5//// 6//// 8//// ICE /////=`;
    return bbxx;
}

function decimalToDm(decimalDegrees) {
    /**
     * Convert decimal degrees to degrees/minutes.decimal format.
     * Returns an object with degrees, minutes, and hemisphere where hemisphere is N/S for latitude or E/W for longitude.
     */
    if (typeof decimalDegrees === 'number') {
        const hemisphere = decimalDegrees >= 0 ? 'N' : 'S';
        const absDegrees = Math.abs(decimalDegrees);
        const degrees = Math.floor(absDegrees);
        const minutes = (absDegrees - degrees) * 60;
        return { degrees, minutes, hemisphere };
    }
    return { degrees: null, minutes: null, hemisphere: null };
}

function decimalToDmStr(decimalDegrees, isLatitude = true) {
    /**
     * Convert decimal degrees to a formatted degrees/minutes.decimal string.
     * For latitude: DD°MM.mmm'N/S
     * For longitude: DDD°MM.mmm'E/W
     */
    if (decimalDegrees === null || decimalDegrees === undefined) {
        return "N/A";
    }
    
    const { degrees, minutes, hemisphere } = decimalToDm(decimalDegrees);
    if (degrees === null) {
        return "N/A";
    }
    
    // For longitude, use E/W instead of N/S
    const finalHemisphere = isLatitude ? hemisphere : (decimalDegrees >= 0 ? 'E' : 'W');
    
    // Format with appropriate width (2 digits for lat, 3 for lon)
    const degFormat = isLatitude ? degrees.toString().padStart(2, '0') : degrees.toString().padStart(3, '0');
    return `${degFormat}°${minutes.toFixed(3).padStart(6, '0')}'${finalHemisphere}`;
}

function humanReadableReport(avgLat, avgLon, avgTwDir, avgTwSpeed, utcTime) {
    const latDm = decimalToDmStr(avgLat, true);
    const lonDm = decimalToDmStr(avgLon, false);
    return `UTC: ${utcTime.toISOString().slice(0, 16).replace('T', ' ')}\n` +
           `  Position: ${avgLat.toFixed(6)}, ${avgLon.toFixed(6)}\n` +
           `           ${latDm}, ${lonDm}\n` +
           `  True Wind: ${avgTwDir.toFixed(1)}° ${avgTwSpeed.toFixed(2)} knots`;
}

module.exports = {
    getBbxxQuadrant,
    generateBbxxReport,
    decimalToDm,
    decimalToDmStr,
    humanReadableReport
}; 