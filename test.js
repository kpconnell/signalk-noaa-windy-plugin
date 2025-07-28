const { generateBbxxReport, decimalToDmStr, humanReadableReport } = require('./src/weatherReport');

console.log('Testing WX NMEA SignalK Plugin Weather Report Functions');
console.log('='.repeat(60));

// Test data
const testData = {
    trueWindDirection: 270,
    trueWindSpeed: 15.5,
    lat: 28.144,
    lon: -112.742,
    utcTime: new Date('2024-01-15T14:30:00Z'),
    stationId: '9RM2K7C',
    waterTemp: 22.5
};

console.log('\nTest Input Data:');
console.log(`True Wind Direction: ${testData.trueWindDirection}°`);
console.log(`True Wind Speed: ${testData.trueWindSpeed} knots`);
console.log(`Latitude: ${testData.lat}°`);
console.log(`Longitude: ${testData.lon}°`);
console.log(`UTC Time: ${testData.utcTime.toISOString()}`);
console.log(`Water Temperature: ${testData.waterTemp}°C`);

// Test BBXX report generation
console.log('\n1. Testing BBXX Report Generation:');
const bbxx = generateBbxxReport(
    testData.trueWindDirection,
    testData.trueWindSpeed,
    testData.lat,
    testData.lon,
    testData.utcTime,
    testData.stationId,
    testData.waterTemp
);
console.log(`BBXX: ${bbxx}`);

// Test coordinate conversion
console.log('\n2. Testing Coordinate Conversion:');
const latDm = decimalToDmStr(testData.lat, true);
const lonDm = decimalToDmStr(testData.lon, false);
console.log(`Latitude: ${testData.lat}° = ${latDm}`);
console.log(`Longitude: ${testData.lon}° = ${lonDm}`);

// Test human readable report
console.log('\n3. Testing Human Readable Report:');
const humanReport = humanReadableReport(
    testData.lat,
    testData.lon,
    testData.trueWindDirection,
    testData.trueWindSpeed,
    testData.utcTime
);
console.log(humanReport);

// Test different quadrants
console.log('\n4. Testing Different Quadrants:');
const quadrantTests = [
    { lat: 45.0, lon: -123.0, desc: 'North/West' },
    { lat: 45.0, lon: 123.0, desc: 'North/East' },
    { lat: -45.0, lon: 123.0, desc: 'South/East' },
    { lat: -45.0, lon: -123.0, desc: 'South/West' }
];

for (const test of quadrantTests) {
    const testBbxx = generateBbxxReport(
        testData.trueWindDirection,
        testData.trueWindSpeed,
        test.lat,
        test.lon,
        testData.utcTime,
        testData.stationId
    );
    console.log(`${test.desc} (${test.lat}, ${test.lon}): ${testBbxx.split(' ').slice(0, 5).join(' ')}...`);
}

console.log('\n✅ All tests completed successfully!');
console.log('\nTo run this plugin:');
console.log('1. npm run build');
console.log('2. npm install');
console.log('3. npm link (for development)');
console.log('4. Install in SignalK server'); 