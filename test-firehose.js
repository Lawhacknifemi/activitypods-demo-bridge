const WebSocket = require('ws');

console.log('Connecting to firehose on ws://localhost:3001...');

const ws = new WebSocket('ws://localhost:3001');

ws.on('open', function open() {
    console.log('✅ Connected to firehose!');
    console.log('Waiting for CAR file exports...');
});

ws.on('message', function message(data) {
    console.log('📦 Received firehose message:');
    console.log('Data length:', data.length, 'bytes');
    
    try {
        // Try to parse as JSON first
        const jsonData = JSON.parse(data);
        console.log('JSON message:', JSON.stringify(jsonData, null, 2));
    } catch (e) {
        // If not JSON, it's likely a CAR file (binary data)
        console.log('Binary CAR file data received');
        console.log('First 100 bytes (hex):', data.slice(0, 100).toString('hex'));
    }
});

ws.on('error', function error(err) {
    console.error('❌ WebSocket error:', err.message);
});

ws.on('close', function close() {
    console.log('🔌 WebSocket connection closed');
});

// Keep the script running
process.on('SIGINT', () => {
    console.log('\nDisconnecting...');
    ws.close();
    process.exit(0);
}); 