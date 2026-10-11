// Release configuration. Configure the deployed HTTPS API here before distribution.
// Never expose this setting in customer screens or accept renderer overrides.
module.exports = Object.freeze({
  apiUrl: 'http://127.0.0.1/degreebee',
  // Same local database, new transport. Keep encrypted sign-in and report folders.
  localMigration: Object.freeze({ from: 'http://127.0.0.1:8765', to: 'http://127.0.0.1/degreebee' }),
});
