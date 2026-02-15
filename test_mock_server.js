import { MockServer } from './src/core/MockServer.js';

async function test() {
    const server = new MockServer(2, 1000);
    await server.init();
    
    console.log('Requesting Raw Data...');
    const data = await server.getData(0, 100);
    console.log('Raw Data Type:', data.type);
    console.log('Data Length:', data.data.length);
    console.log('Series 0 Length:', data.data[0].length);
    console.log('Sample:', data.data[0][0]);
    
    console.log('Requesting Aggregated Data...');
    const aggData = await server.getData(0, 100, 2);
    console.log('Agg Data Type:', aggData.type);
    console.log('Agg Data Length:', aggData.data[0].length);
}

test();
