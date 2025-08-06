import React, { useState, useEffect } from 'react';
import './App.css';

const App = () => {
  const [userDetails, setUserDetails] = useState({
    handle: '',
    pdsServer: 'bsky.social',
    displayName: '',
    email: '',
    password: ''
  });
  
  const [currentDid, setCurrentDid] = useState('');
  const [currentActor, setCurrentActor] = useState('');
  const [newPost, setNewPost] = useState('');
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [message, setMessage] = useState('');
  const [isSetup, setIsSetup] = useState(false);
  const [firehoseEvents, setFirehoseEvents] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);

  const BACKEND_URL = 'http://localhost:3000';

  // Generate unique username and email to avoid conflicts
  const generateUniqueCredentials = (handle) => {
    const timestamp = Date.now();
    const username = `${handle.split('.')[0]}_${timestamp}`;
    const email = `user_${timestamp}@example.com`;
    return { username, email };
  };

  // Create DID and Actor
  const setupIdentity = async () => {
    if (!userDetails.handle || !userDetails.email || !userDetails.password) {
      setMessage('Please fill in all required fields');
      return;
    }

    setLoading(true);
    setMessage('Setting up your identity...');

    try {
      // Step 1: Create DID
      const didResponse = await fetch(`${BACKEND_URL}/identity/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handle: userDetails.handle,
          pdsServer: userDetails.pdsServer,
          displayName: userDetails.displayName,
          description: `Created via ActivityPods Bridge`
        })
      });

      if (!didResponse.ok) {
        throw new Error('Failed to create DID');
      }

      const didData = await didResponse.json();
      setCurrentDid(didData.did);
      setMessage(`✅ DID created: ${didData.did}`);

      // Step 2: Create ActivityPub Actor with unique credentials
      const { username, email: generatedEmail } = generateUniqueCredentials(userDetails.handle);
      const actorResponse = await fetch(`${BACKEND_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username,
          email: userDetails.email || generatedEmail, // Use user's email if provided, otherwise generated
          password: userDetails.password
        })
      });

      if (!actorResponse.ok) {
        const errorText = await actorResponse.text();
        if (errorText.includes('email.already.exists')) {
          throw new Error('Email already exists. Please use a different email address.');
        } else {
          throw new Error(`Failed to create ActivityPub actor: ${errorText}`);
        }
      }

      const actorData = await actorResponse.json();
      setCurrentActor(actorData.webId);
      setMessage(`✅ Actor created: ${actorData.webId}`);

      // Step 3: Register bridge mapping
      const mappingResponse = await fetch(`${BACKEND_URL}/bridge/registerMapping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actorUri: actorData.webId,
          did: didData.did
        })
      });

      if (mappingResponse.ok) {
        setIsSetup(true);
        setMessage('🎉 Setup complete! You can now create posts that sync to both ATProto and ActivityPub.');
      } else {
        setMessage('⚠️ Setup complete but bridge mapping failed. Posts may not sync properly.');
      }

    } catch (error) {
      setMessage(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Create post that syncs to both protocols
  const createPost = async () => {
    if (!newPost.trim()) {
      setMessage('Please enter a post');
      return;
    }

    if (!isSetup) {
      setMessage('Please setup your identity first');
      return;
    }

    setLoading(true);
    setMessage('Creating post...');

    try {
      // Generate a unique rkey for the post
      const timestamp = Date.now();
      const rkey = `post_${timestamp}`;
      
      // Create ATProto post
      const atprotoResponse = await fetch(`${BACKEND_URL}/atproto/record/${currentDid}/app.bsky.feed.post/${rkey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: newPost,
          createdAt: new Date().toISOString()
        })
      });

      if (atprotoResponse.ok) {
        setMessage('✅ Post created and synced to both ATProto and ActivityPub!');
        
        setNewPost('');
        // Wait a bit for the backend to process, then load posts
        setTimeout(() => {
          loadPosts();
        }, 1500);
      } else {
        const errorText = await atprotoResponse.text();
        throw new Error(`Failed to create post: ${errorText}`);
      }

    } catch (error) {
      setMessage(`❌ Error creating post: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Load posts
  const loadPosts = async () => {
    if (!currentDid || loadingPosts) return;

    setLoadingPosts(true);
    try {
      const response = await fetch(`${BACKEND_URL}/atproto/record/${currentDid}/app.bsky.feed.post`);
      console.log('Posts API response status:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('Posts API data:', data);
        const postsToSet = data.records || [];
        console.log('Setting posts:', postsToSet);
        setPosts(postsToSet);
      } else {
        // If no posts exist yet, that's normal for a new user
        const errorText = await response.text();
        console.log('Posts API not ok, error:', errorText);
        setPosts([]);
      }
    } catch (error) {
      console.error('Failed to load posts:', error);
      // Don't show error to user, just set empty posts
      setPosts([]);
    } finally {
      setLoadingPosts(false);
    }
  };

  useEffect(() => {
    if (isSetup) {
      // Add a longer delay to give backend time to process
      const timer = setTimeout(() => {
        loadPosts();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isSetup, currentDid]);

  // WebSocket connection for firehose
  useEffect(() => {
    if (!isSetup) return;

    const ws = new WebSocket('ws://localhost:3001');
    
    ws.onopen = () => {
      console.log('🔥 Firehose WebSocket connected');
      setWsConnected(true);
      setMessage('🔥 Firehose connected - watching for real-time updates...');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('🔥 Firehose event received:', data);
        
        setFirehoseEvents(prev => {
          const newEvent = {
            id: Date.now(),
            timestamp: new Date().toLocaleTimeString(),
            type: data.type || 'unknown',
            data: data
          };
          return [newEvent, ...prev.slice(0, 9)]; // Keep last 10 events
        });
      } catch (error) {
        console.error('Error parsing firehose event:', error);
      }
    };

    ws.onclose = () => {
      console.log('🔥 Firehose WebSocket disconnected');
      setWsConnected(false);
    };

    ws.onerror = (error) => {
      console.error('🔥 Firehose WebSocket error:', error);
      setWsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [isSetup]);

  return (
    <div className="App">
      <header className="App-header">
        <h1>🌉 ActivityPods Bridge</h1>
        <p>Create posts that sync to both ATProto and ActivityPub</p>
      </header>

      <main className="App-main">
        {!isSetup ? (
          /* Setup Form */
          <section className="setup-form">
            <h2>🚀 Setup Your Identity</h2>
            <p>Create your DID and ActivityPub actor to get started</p>
            
            <div className="form-group">
              <label>Handle (e.g., myuser.bsky.social):</label>
              <input
                type="text"
                value={userDetails.handle}
                onChange={(e) => setUserDetails(prev => ({ ...prev, handle: e.target.value }))}
                placeholder="myuser.bsky.social"
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label>PDS Server:</label>
              <input
                type="text"
                value={userDetails.pdsServer}
                onChange={(e) => setUserDetails(prev => ({ ...prev, pdsServer: e.target.value }))}
                placeholder="bsky.social"
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label>Display Name:</label>
              <input
                type="text"
                value={userDetails.displayName}
                onChange={(e) => setUserDetails(prev => ({ ...prev, displayName: e.target.value }))}
                placeholder="Your Display Name"
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label>Email:</label>
              <input
                type="email"
                value={userDetails.email}
                onChange={(e) => setUserDetails(prev => ({ ...prev, email: e.target.value }))}
                placeholder="your@email.com (optional - will generate unique email)"
                disabled={loading}
              />
              <small style={{ color: '#666', fontSize: '0.85rem' }}>
                Leave empty to generate a unique email automatically
              </small>
            </div>

            <div className="form-group">
              <label>Password:</label>
              <input
                type="password"
                value={userDetails.password}
                onChange={(e) => setUserDetails(prev => ({ ...prev, password: e.target.value }))}
                placeholder="Your password"
                disabled={loading}
              />
            </div>

            <button 
              onClick={setupIdentity} 
              disabled={loading || !userDetails.handle || !userDetails.email || !userDetails.password}
              className="btn btn-primary"
            >
              {loading ? '🔄 Setting up...' : '🚀 Setup Identity'}
            </button>
          </section>
        ) : (
          /* Post Creation */
          <section className="post-creation">
            <h2>📝 Create Post</h2>
            <div className="identity-info">
              <p><strong>DID:</strong> {currentDid}</p>
              <p><strong>Actor:</strong> {currentActor}</p>
            </div>

            <div className="form-group">
              <label>Your Post:</label>
              <textarea
                value={newPost}
                onChange={(e) => setNewPost(e.target.value)}
                placeholder="What's on your mind?"
                rows={4}
                disabled={loading}
              />
            </div>

            <button 
              onClick={createPost} 
              disabled={loading || !newPost.trim()}
              className="btn btn-primary"
            >
              {loading ? '🔄 Creating...' : '📤 Create Post'}
            </button>

            {/* Posts List */}
            <div className="posts-list">
              <h3>📋 Your Posts ({posts.length})</h3>
              {console.log('Rendering posts:', posts)}
              {posts.length > 0 ? (
                posts.map((post, index) => {
                  console.log('Rendering post:', post);
                  return (
                    <div key={index} className="post-item">
                      <p>{post.value?.text || 'Post content'}</p>
                      <small>{new Date(post.value?.createdAt || Date.now()).toLocaleString()}</small>
                    </div>
                  );
                })
              ) : (
                <div className="post-item empty-state">
                  <p>No posts yet. Create your first post above! 📝</p>
                </div>
              )}
            </div>

            {/* Firehose Events */}
            <div className="firehose-section">
              <h3>
                🔥 Firehose Events 
                <span className={`status-indicator ${wsConnected ? 'connected' : 'disconnected'}`}>
                  {wsConnected ? '●' : '○'}
                </span>
              </h3>
              <div className="firehose-events">
                {firehoseEvents.length > 0 ? (
                  firehoseEvents.map((event) => (
                    <div key={event.id} className="firehose-event">
                      <div className="event-header">
                        <span className="event-type">{event.type}</span>
                        <span className="event-time">{event.timestamp}</span>
                      </div>
                      <div className="event-data">
                        <pre>{JSON.stringify(event.data, null, 2)}</pre>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="firehose-event empty-state">
                    <p>No firehose events yet. Create a post to see real-time updates! 🔥</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Message Display */}
        {message && (
          <div className={`message ${message.includes('❌') ? 'error' : message.includes('✅') ? 'success' : 'info'}`}>
            {message}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
