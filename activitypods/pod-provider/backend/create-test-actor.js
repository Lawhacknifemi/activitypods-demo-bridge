// Script to create the test user ActivityPub actor for the bridge
const { ServiceBroker } = require('moleculer');
const urlJoin = require('url-join');
const { MIME_TYPES } = require('@semapps/mime-types');
const { ACTOR_TYPES } = require('@semapps/activitypub');

async function createTestActor() {
  const broker = new ServiceBroker({
    nodeID: 'create-actor-script',
    logger: {
      type: 'Console',
      options: {
        level: 'info'
      }
    }
  });

  try {
    // Connect to the existing backend
    await broker.start();
    
    const BASE_URL = 'http://localhost:3000';
    const TEST_USERNAME = 'testuser';
    const TEST_WEBID = urlJoin(BASE_URL, TEST_USERNAME);
    
    console.log('🔧 Creating test user ActivityPub actor...');
    console.log(`Username: ${TEST_USERNAME}`);
    console.log(`WebID: ${TEST_WEBID}`);
    
    // Check if actor already exists
    const actorExists = await broker.call('ldp.resource.exist', { 
      resourceUri: TEST_WEBID 
    });
    
    if (actorExists) {
      console.log('✅ Test user actor already exists!');
      return;
    }
    
    // Create account
    console.log('📝 Creating account...');
    const account = await broker.call('auth.account.create', {
      username: TEST_USERNAME,
      webId: TEST_WEBID
    }, { meta: { isSystemCall: true } });
    
    console.log('✅ Account created:', account['@id']);
    
    // Create storage
    console.log('💾 Creating storage...');
    const storageUrl = await broker.call('solid-storage.create', { 
      username: TEST_USERNAME 
    });
    
    console.log('✅ Storage created:', storageUrl);
    
    // Create the ActivityPub actor
    console.log('👤 Creating ActivityPub actor...');
    await broker.call('ldp.container.post', {
      containerUri: urlJoin(BASE_URL, 'as', 'actor'),
      slug: TEST_USERNAME,
      resource: {
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: ACTOR_TYPES.PERSON,
        preferredUsername: TEST_USERNAME,
        name: 'Test User',
        summary: 'Test user for ActivityPods Bridge demo',
        inbox: urlJoin(TEST_WEBID, 'inbox'),
        outbox: urlJoin(TEST_WEBID, 'outbox'),
        followers: urlJoin(TEST_WEBID, 'followers'),
        following: urlJoin(TEST_WEBID, 'following'),
        liked: urlJoin(TEST_WEBID, 'liked'),
        'pim:storage': storageUrl
      },
      contentType: MIME_TYPES.JSON,
      webId: 'system'
    });
    
    console.log('✅ ActivityPub actor created!');
    
    // Wait for actor creation to complete
    console.log('⏳ Waiting for actor creation to complete...');
    const actor = await broker.call('activitypub.actor.awaitCreateComplete', { 
      actorUri: TEST_WEBID 
    });
    
    console.log('🎉 Test user actor created successfully!');
    console.log('Actor details:', JSON.stringify(actor, null, 2));
    
    // Test the bridge mapping
    console.log('🔗 Testing bridge mapping...');
    await broker.call('atproto.bridge.registerMapping', {
      actorUri: TEST_WEBID,
      did: 'did:plc:testuser123'
    });
    
    console.log('✅ Bridge mapping registered!');
    
  } catch (error) {
    console.error('❌ Error creating test actor:', error.message);
    console.error(error.stack);
  } finally {
    await broker.stop();
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