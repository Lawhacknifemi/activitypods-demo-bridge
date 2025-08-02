const { Repo } = require('../../../semapps/src/middleware/packages/atproto/utils/atproto-utils');

console.log('Repo class imported:', typeof Repo);
console.log('Repo class:', Repo);

if (typeof Repo === 'function') {
  console.log('✅ Repo class imported successfully');
} else {
  console.log('❌ Repo class not imported correctly');
} 