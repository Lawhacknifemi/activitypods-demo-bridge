const { AtprotoService } = require('../../../semapps/src/middleware/packages/atproto');

// Simple test to verify the service loads
console.log('Testing atproto service...');
console.log('AtprotoService:', AtprotoService);

// Test the service structure
if (AtprotoService.name === 'atproto') {
  console.log('✅ Service name is correct');
} else {
  console.log('❌ Service name is incorrect');
}

if (AtprotoService.actions && AtprotoService.actions.hello) {
  console.log('✅ Hello action exists');
} else {
  console.log('❌ Hello action missing');
}

console.log('✅ Basic atproto service test completed!'); 