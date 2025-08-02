#!/usr/bin/env node

const axios = require('axios');

async function debugTriplestore() {
  console.log('🔍 Debugging Triplestore Data\n');

  const DID = 'did:plc:testuser123';

  try {
    // Test 1: Check if dataset exists
    console.log('1️⃣ Checking dataset existence...');
    try {
      const response = await axios.get(`http://localhost:3030/$/datasets`);
      console.log('✅ Datasets endpoint accessible');
    } catch (error) {
      console.log('❌ Cannot access datasets endpoint:', error.message);
    }

    // Test 2: Try a simple query
    console.log('\n2️⃣ Testing simple SPARQL query...');
    try {
      const simpleQuery = 'SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 5';
      const response = await axios.post(
        `http://localhost:3030/${DID}/query`,
        simpleQuery,
        {
          headers: {
            'Content-Type': 'application/sparql-query',
            'Accept': 'application/sparql-results+json'
          },
          auth: {
            username: 'admin',
            password: 'admin'
          }
        }
      );
      console.log('✅ Simple query successful');
      console.log('   Results:', response.data.results.bindings.length, 'triples found');
      
      if (response.data.results.bindings.length > 0) {
        console.log('   Sample triple:', response.data.results.bindings[0]);
      }
    } catch (error) {
      console.log('❌ Simple query failed:', error.response?.data || error.message);
    }

    // Test 3: Try to find atproto records
    console.log('\n3️⃣ Looking for atproto records...');
    try {
      const atprotoQuery = `
        PREFIX atproto: <https://atproto.com/ns#>
        SELECT ?s ?p ?o WHERE { 
          ?s a atproto:Record .
          ?s ?p ?o 
        } LIMIT 10
      `;
      const response = await axios.post(
        `http://localhost:3030/${DID}/query`,
        atprotoQuery,
        {
          headers: {
            'Content-Type': 'application/sparql-query',
            'Accept': 'application/sparql-results+json'
          },
          auth: {
            username: 'admin',
            password: 'admin'
          }
        }
      );
      console.log('✅ Atproto records query successful');
      console.log('   Found', response.data.results.bindings.length, 'atproto-related triples');
      
      if (response.data.results.bindings.length > 0) {
        console.log('   Sample atproto triple:', response.data.results.bindings[0]);
      }
    } catch (error) {
      console.log('❌ Atproto records query failed:', error.response?.data || error.message);
    }

    // Test 4: Check what URIs exist
    console.log('\n4️⃣ Checking what URIs exist...');
    try {
      const uriQuery = `
        SELECT DISTINCT ?uri WHERE { 
          ?uri ?p ?o 
        } LIMIT 10
      `;
      const response = await axios.post(
        `http://localhost:3030/${DID}/query`,
        uriQuery,
        {
          headers: {
            'Content-Type': 'application/sparql-query',
            'Accept': 'application/sparql-results+json'
          },
          auth: {
            username: 'admin',
            password: 'admin'
          }
        }
      );
      console.log('✅ URI query successful');
      console.log('   Found', response.data.results.bindings.length, 'unique URIs');
      
      response.data.results.bindings.forEach((binding, index) => {
        console.log(`   URI ${index + 1}:`, binding.uri.value);
      });
    } catch (error) {
      console.log('❌ URI query failed:', error.response?.data || error.message);
    }

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  }
}

debugTriplestore().catch(console.error); 