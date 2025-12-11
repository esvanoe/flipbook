import { VictimClient } from './victim-client.js';

// Initialize victim client when page loads
document.addEventListener('DOMContentLoaded', () => {
  const client = new VictimClient();
  client.initialize();
});

