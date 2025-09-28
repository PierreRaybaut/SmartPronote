// Helper script to get Google Tasks List ID
// Run this after setting up credentials: node get-task-list-id.js

const { google } = require('googleapis');
const fs = require('fs');

async function getTaskListId() {
  try {
    // Load service account credentials
    const credentials = JSON.parse(fs.readFileSync('google-credentials.json', 'utf8'));
    
    // Create JWT auth client
    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/tasks']
    );

    // Create Tasks API client
    const tasks = google.tasks({ version: 'v1', auth });

    // Get all task lists
    const response = await tasks.tasklists.list();
    
    console.log('Available Task Lists:');
    response.data.items.forEach((list, index) => {
      console.log(`${index + 1}. ${list.title} (ID: ${list.id})`);
    });

    // Return the default list ID
    const defaultList = response.data.items.find(list => list.title === '@default') || response.data.items[0];
    console.log(`\nRecommended Task List ID: ${defaultList.id}`);
    console.log('Copy this ID to your config.json taskListId field');
    
    return defaultList.id;
  } catch (error) {
    console.error('Error getting task lists:', error.message);
    console.log('Make sure:');
    console.log('1. google-credentials.json exists in this directory');
    console.log('2. Google Tasks API is enabled');
    console.log('3. Service account has proper permissions');
  }
}

getTaskListId();