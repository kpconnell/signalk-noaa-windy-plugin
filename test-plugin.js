#!/usr/bin/env node

/**
 * Plugin Validation Test
 * This script tests the plugin startup and basic functionality
 * to catch issues before publishing.
 */

const path = require('path');
const fs = require('fs');

console.log('🔍 Starting plugin validation test...\n');

// Test 1: Check if all required files exist
console.log('📁 Testing file structure...');
const requiredFiles = [
    'src/index.js',
    'src/signalkReader.js', 
    'src/weatherReport.js',
    'package.json'
];

let fileErrors = 0;
for (const file of requiredFiles) {
    if (fs.existsSync(file)) {
        console.log(`  ✅ ${file}`);
    } else {
        console.log(`  ❌ ${file} - MISSING`);
        fileErrors++;
    }
}

if (fileErrors > 0) {
    console.error(`\n❌ ${fileErrors} required files are missing!`);
    process.exit(1);
}

// Test 2: Validate package.json
console.log('\n📦 Testing package.json...');
try {
    const packageJson = require('./package.json');
    
    // Check required fields
    const requiredFields = ['name', 'version', 'main', 'description'];
    for (const field of requiredFields) {
        if (!packageJson[field]) {
            throw new Error(`Missing required field: ${field}`);
        }
    }
    
    // Check main entry point
    if (packageJson.main !== 'src/index.js') {
        throw new Error(`Main entry point should be 'src/index.js', got: ${packageJson.main}`);
    }
    
    console.log('  ✅ package.json is valid');
} catch (error) {
    console.error(`  ❌ package.json error: ${error.message}`);
    process.exit(1);
}

// Test 3: Syntax validation
console.log('\n🔤 Testing syntax...');
const filesToCheck = [
    'src/index.js',
    'src/signalkReader.js',
    'src/weatherReport.js'
];

let syntaxErrors = 0;
for (const file of filesToCheck) {
    try {
        // Try to require the file to check syntax
        require(path.resolve(file));
        console.log(`  ✅ ${file} - syntax OK`);
    } catch (error) {
        console.error(`  ❌ ${file} - syntax error: ${error.message}`);
        syntaxErrors++;
    }
}

if (syntaxErrors > 0) {
    console.error(`\n❌ ${syntaxErrors} files have syntax errors!`);
    process.exit(1);
}

// Test 4: Plugin initialization test
console.log('\n🚀 Testing plugin initialization...');
try {
    // Mock SignalK app for testing
    const mockApp = {
        getSelfPath: (path) => {
            // Return mock data for testing
            const mockData = {
                'navigation.headingMagnetic.value': 1.57, // 90 degrees
                'navigation.headingTrue.value': 1.57,
                'navigation.magneticVariation.value': 0,
                'navigation.speedOverGround.value': 5.0, // 5 m/s
                'navigation.position.value.latitude': 40.7128,
                'navigation.position.value.longitude': -74.0060,
                'environment.wind.angleApparent.value': 0.785, // 45 degrees
                'environment.wind.speedApparent.value': 10.0, // 10 m/s
                'environment.water.temperature.value': 288.15 // 15°C
            };
            return mockData[path] || null;
        }
    };

    // Load the plugin
    const pluginFactory = require('./src/index.js');
    const plugin = pluginFactory(mockApp);
    
    // Test plugin structure
    const requiredPluginMethods = ['id', 'name', 'description', 'schema', 'start', 'stop', 'statusMessage'];
    for (const method of requiredPluginMethods) {
        if (!(method in plugin)) {
            throw new Error(`Missing required plugin method: ${method}`);
        }
    }
    
    console.log('  ✅ Plugin structure is valid');
    
    // Test status message
    const status = plugin.statusMessage();
    if (typeof status !== 'string') {
        throw new Error(`Status message should be a string, got: ${typeof status}`);
    }
    console.log(`  ✅ Status message: "${status}"`);
    
    // Test schema validation
    if (!plugin.schema || typeof plugin.schema !== 'object') {
        throw new Error('Plugin schema is missing or invalid');
    }
    console.log('  ✅ Plugin schema is valid');
    
} catch (error) {
    console.error(`  ❌ Plugin initialization error: ${error.message}`);
    process.exit(1);
}

// Test 5: Module exports test
console.log('\n📤 Testing module exports...');
try {
    const signalkReader = require('./src/signalkReader.js');
    const weatherReport = require('./src/weatherReport.js');
    
    // Check if required functions are exported
    if (typeof signalkReader.collectSignalkData !== 'function') {
        throw new Error('collectSignalkData function not exported from signalkReader.js');
    }
    
    if (typeof weatherReport.generateBbxxReport !== 'function') {
        throw new Error('generateBbxxReport function not exported from weatherReport.js');
    }
    
    console.log('  ✅ All required functions are exported');
    
} catch (error) {
    console.error(`  ❌ Module exports error: ${error.message}`);
    process.exit(1);
}

// Test 6: Basic functionality test
console.log('\n⚙️ Testing basic functionality...');
try {
    const { collectSignalkData } = require('./src/signalkReader.js');
    const { generateBbxxReport } = require('./src/weatherReport.js');
    
    // Mock app for data collection test
    const mockApp = {
        getSelfPath: (path) => {
            const mockData = {
                'navigation.headingMagnetic.value': 1.57,
                'navigation.headingTrue.value': 1.57,
                'navigation.magneticVariation.value': 0,
                'navigation.speedOverGround.value': 5.0,
                'navigation.position.value.latitude': 40.7128,
                'navigation.position.value.longitude': -74.0060,
                'environment.wind.angleApparent.value': 0.785,
                'environment.wind.speedApparent.value': 10.0,
                'environment.water.temperature.value': 288.15
            };
            return mockData[path] || null;
        }
    };
    
    // Test BBXX report generation
    const testData = {
        true_wind_dir: 45,
        true_wind_speed: 15,
        lat: 40.7128,
        lon: -74.0060,
        utc_time: new Date(),
        water_temp: 15
    };
    
    const bbxx = generateBbxxReport(
        testData.true_wind_dir,
        testData.true_wind_speed,
        testData.lat,
        testData.lon,
        testData.utc_time,
        'TEST123',
        testData.water_temp
    );
    
    if (!bbxx || typeof bbxx !== 'string') {
        throw new Error('BBXX report generation failed');
    }
    
    console.log('  ✅ BBXX report generation works');
    console.log(`  📋 Sample BBXX: ${bbxx.substring(0, 50)}...`);
    
} catch (error) {
    console.error(`  ❌ Basic functionality error: ${error.message}`);
    process.exit(1);
}

// Test 7: Error handling test
console.log('\n🛡️ Testing error handling...');
try {
    const { collectSignalkData } = require('./src/signalkReader.js');
    
    // Mock app with missing data
    const mockAppNoData = {
        getSelfPath: (path) => null // Return null for all paths
    };
    
    // This should handle missing data gracefully
    collectSignalkData(mockAppNoData, 1, 1, 'TEST123').then(result => {
        if (result !== null) {
            throw new Error('Should return null when no data is available');
        }
        
        console.log('  ✅ Error handling works correctly');
        
        console.log('\n🎉 All tests passed! Plugin is ready for publishing.');
        console.log('\n📋 Summary:');
        console.log('  ✅ File structure is correct');
        console.log('  ✅ package.json is valid');
        console.log('  ✅ All syntax is correct');
        console.log('  ✅ Plugin initializes properly');
        console.log('  ✅ Module exports are correct');
        console.log('  ✅ Basic functionality works');
        console.log('  ✅ Error handling is robust');
        
        process.exit(0);
    }).catch(error => {
        console.error(`  ❌ Error handling test failed: ${error.message}`);
        process.exit(1);
    });
    
} catch (error) {
    console.error(`  ❌ Error handling test failed: ${error.message}`);
    process.exit(1);
} 