import { AdminClient } from './admin-client.js';

// Initialize admin client when page loads
document.addEventListener('DOMContentLoaded', () => {
  const client = new AdminClient();
  client.initialize();
});

