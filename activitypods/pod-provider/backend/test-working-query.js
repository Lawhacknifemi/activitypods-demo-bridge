#!/usr/bin/env node

const axios = require('axios');

async function testWorkingQuery() {
  console.log('🧪 Testing Working Query\n');

  const DID = 'did:plc:testuser123';
  const COLLECTION = 'app.bsky.feed.post';

  try {
    // Use the exact query that worked in our debug script
    const workingQuery = `
      PREFIX atproto: <https://atproto.com/ns#>
      SELECT ?s ?p ?o WHERE { 
        ?s a atproto:Record .
        ?s ?p ?o 
      } LIMIT 10
    `;

    console.log('Query:', workingQuery);

    const response = await axios.post(
      `http://localhost:3030/${DID}/query`,
      workingQuery,
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

    console.log('✅ Query successful!');
    console.log('Results:', response.data.results.bindings.length, 'records found');
    
    // Filter for our specific collection
    const filteredResults = response.data.results.bindings.filter(binding => {
      if (binding.p.value === 'https://atproto.com/ns#hasCollection') {
        return binding.o.value === COLLECTION;
      }
      return false;
    });

    console.log('Filtered for collection:', filteredResults.length, 'records');
    
    // Get the URIs for this collection
    const uris = [...new Set(filteredResults.map(binding => binding.s.value))];
    console.log('URIs for collection:', uris);

    // Now get the full data for each URI
    for (const uri of uris) {
      console.log(`\nGetting data for URI: ${uri}`);
      
      const dataQuery = `
        PREFIX atproto: <https://atproto.com/ns#>
        PREFIX as: <https://www.w3.org/ns/activitystreams#>
        SELECT ?p ?o WHERE { 
          <${uri}> ?p ?o 
        }
      `;

      const dataResponse = await axios.post(
        `http://localhost:3030/${DID}/query`,
        dataQuery,
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

      const recordData = {};
      dataResponse.data.results.bindings.forEach(binding => {
        recordData[binding.p.value] = binding.o.value;
      });

      console.log('Record data:', recordData);
    }

  } catch (error) {
    console.error('❌ Query failed:', error.response?.data || error.message);
  }
}

testWorkingQuery().catch(console.error); 