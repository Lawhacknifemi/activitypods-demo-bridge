// Script to create the test user ActivityPub actor for the bridge
const fetch = require('node-fetch');
const urlJoin = require('url-join');

async function createTestActor() {
  const BASE_URL = 'http://localhost:3000';
  const TEST_USERNAME = 'testuser';
  const TEST_WEBID = urlJoin(BASE_URL, TEST_USERNAME);
  
  console.log('🔧 Creating test user ActivityPub actor...');
  console.log(`Username: ${TEST_USERNAME}`);
  console.log(`WebID: ${TEST_WEBID}`);
  
  try {
    // Step 1: Create account using the auth API
    console.log('📝 Creating account...');
    const accountResponse = await fetch(`${BASE_URL}/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: TEST_USERNAME,
        email: 'testuser@localhost',
        password: 'testpassword123'
      })
    });
    
    if (!accountResponse.ok) {
      const errorText = await accountResponse.text();
      console.log('Account creation response:', accountResponse.status, errorText);
      
      // If account already exists, that's fine
      if (accountResponse.status === 400 && errorText.includes('already exists')) {
        console.log('✅ Account already exists, continuing...');
      } else {
        throw new Error(`Account creation failed: ${accountResponse.status} ${errorText}`);
      }
    } else {
      const accountData = await accountResponse.json();
      console.log('✅ Account created:', accountData.webId);
    }
    
    // Step 2: Check if the actor exists
    console.log('🔍 Checking if actor exists...');
    const actorResponse = await fetch(TEST_WEBID, {
      method: 'GET',
      headers: {
        'Accept': 'application/ld+json'
      }
    });
    
    if (actorResponse.ok) {
      console.log('✅ Test user actor already exists!');
    } else {
      console.log('❌ Actor does not exist, creating...');
      
      // Step 3: Create the actor manually by posting to the actor container
      console.log('👤 Creating ActivityPub actor...');
      const createActorResponse = await fetch(`${BASE_URL}/as/actor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/ld+json',
          'Accept': 'application/ld+json'
        },
        body: JSON.stringify({
          '@context': 'https://www.w3.org/ns/activitystreams',
          '@id': TEST_WEBID,
          type: 'Person',
          preferredUsername: TEST_USERNAME,
          name: 'Test User',
          summary: 'Test user for ActivityPods Bridge demo',
          inbox: urlJoin(TEST_WEBID, 'inbox'),
          outbox: urlJoin(TEST_WEBID, 'outbox'),
          followers: urlJoin(TEST_WEBID, 'followers'),
          following: urlJoin(TEST_WEBID, 'following'),
          liked: urlJoin(TEST_WEBID, 'liked')
        })
      });
      
      if (!createActorResponse.ok) {
        const errorText = await createActorResponse.text();
        throw new Error(`Actor creation failed: ${createActorResponse.status} ${errorText}`);
      }
      
      console.log('✅ ActivityPub actor created!');
    }
    
    // Step 4: Test the bridge mapping
    console.log('🔗 Testing bridge mapping...');
    const mappingResponse = await fetch(`${BASE_URL}/bridge/registerMapping`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        actorUri: TEST_WEBID,
        did: 'did:plc:testuser123'
      })
    });
    
    if (mappingResponse.ok) {
      console.log('✅ Bridge mapping registered!');
    } else {
      const errorText = await mappingResponse.text();
      console.log('⚠️ Bridge mapping failed:', errorText);
    }
    
    // Step 5: Test creating a post
    console.log('📝 Testing post creation...');
    const postResponse = await fetch(`${BASE_URL}/atproto/record/did:plc:testuser123/app.bsky.feed.post/test-actor-creation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: 'Test post from actor creation script! 🎉',
        createdAt: new Date().toISOString(),
        langs: ['en']
      })
    });
    
    if (postResponse.ok) {
      const postData = await postResponse.json();
      console.log('✅ Test post created successfully!');
      console.log('Post URI:', postData.uri);
      console.log('Post CID:', postData.cid);
    } else {
      const errorText = await postResponse.text();
      console.log('⚠️ Test post creation failed:', errorText);
    }
    
    console.log('🎉 Test user actor setup completed!');
    
  } catch (error) {
    console.error('❌ Error creating test actor:', error.message);
    console.error(error.stack);
  }
}

// Run the script
createTestActor().then(() => {
  console.log('🏁 Script completed!');
  process.exit(0);
}).catch((error) => {
  console.error('💥 Script failed:', error);
  process.exit(1);
}); 