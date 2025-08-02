#!/usr/bin/env node

const axios = require('axios');

async function testSimpleQuery() {
  console.log('🧪 Testing Simple SPARQL Query\n');

  const DID = 'did:plc:testuser123';
  const COLLECTION = 'app.bsky.feed.post';

  try {
    // Test the exact simple query
    const simpleQuery = `
      PREFIX atproto: <https://atproto.com/ns#>
      PREFIX as: <https://www.w3.org/ns/activitystreams#>
      
      SELECT ?uri ?cid ?rkey ?recordData ?createdAt
      WHERE {
        ?uri a atproto:Record ;
             atproto:hasCollection "${COLLECTION}" ;
             atproto:hasRkey ?rkey ;
             atproto:hasCid ?cid ;
             atproto:recordData ?recordData ;
             as:published ?createdAt .
      }
      ORDER BY ?rkey DESC
      LIMIT 100
    `;

    console.log('Query:', simpleQuery);

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

    console.log('✅ Query successful!');
    console.log('Results:', response.data.results.bindings.length, 'records found');
    
    response.data.results.bindings.forEach((binding, index) => {
      console.log(`\nRecord ${index + 1}:`);
      console.log('  URI:', binding.uri.value);
      console.log('  CID:', binding.cid.value);
      console.log('  RKey:', binding.rkey.value);
      console.log('  Data:', binding.recordData.value);
      console.log('  Created:', binding.createdAt.value);
    });

  } catch (error) {
    console.error('❌ Query failed:', error.response?.data || error.message);
  }
}

testSimpleQuery().catch(console.error); 