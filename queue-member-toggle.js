const appName = 'AgentQueueMemberToggle';
const platformClient = require('platformClient');
const clientId = '55b4d776-4dfa-4023-af31-2458954f910b';

const client = platformClient.ApiClient.instance;
client.setEnvironment('mypurecloud.de');
client.setPersistSettings(true, appName);

const redirectUri = window.location.origin + window.location.pathname;

// Supported media types (to be recognized in queue names, lowercase) and matching toggle slider labels
const supportedMediaTypes = {
  chat: 'Chat',
  email: 'E-mail',
  voice: 'Voice'
};

var usersApi = new platformClient.UsersApi();
var routingApi = new platformClient.RoutingApi();

var agentId = undefined;
var agentQueues = undefined;
var relevantMediatypes = undefined;

// COMMENT OUT WHEN WORKING ON (UNSECURE) LOCALHOST
// upgrade to https
//if (location.protocol !== "https:") {
//  location.replace(
//    `https:${location.href.substring(location.protocol.length)}`
//  );
//}

function renderQueueStatus() {
  let resultsHtml = '';
  if (agentQueues.length > 0) {
    resultsHtml += `<table class="queue-status-table"><tr class="info-table"><th class="column-QueueName">Queue Name</th><th class="column-JoinedStatus">Joined</th></tr>`;

    agentQueues.forEach((queue) => {
      resultsHtml += `<tr class="queue-status-table"><td class="column-QueueName">${queue.name}</td><td class="column-JoinedStatus">${(queue.joined ? 'Yes' : 'No')}</td></tr>`;
    });
    resultsHtml += '</table>'
  }
  else {
    resultsHtml = '<p class="warning">Agent is not assigned to any queue</p>';
  }

  // Show queue status block
  $('#queue-status').html(resultsHtml);
  $('#queue-status').removeClass('hidden');
}

function renderControls() {
  let resultsHtml = '';
  if (relevantMediatypes.length > 0) {
    resultsHtml += '<table>';

    // First, add all HTML code for slider controls
    relevantMediatypes.forEach((thisRelevantMediaType) => {
      resultsHtml += `<tr class="controls-table"><td class="column-MediaType">${supportedMediaTypes[thisRelevantMediaType.mediaType]}</td><td class="column-ToggleStatus"><label class="switch"><input id="toggle-${thisRelevantMediaType.mediaType}" type="checkbox" ${(thisRelevantMediaType.joinStatus ? 'checked' : '')} value="${thisRelevantMediaType.mediaType}"><span class="slider"></span></label></td></tr>`;
    })
    resultsHtml += '</table>';
    $('#toggle-controls').html(resultsHtml);

    // Next, add event handlers to all slider controls individually
    relevantMediatypes.forEach((thisRelevantMediaType) => {
      $(`#toggle-${thisRelevantMediaType.mediaType}`).on(
        'click',
        debounce((e) => {
          updateQueueStatus(e.target.value, e.target.checked);
        }, 100)
      );
    })

    // Finally, unhide slider controls
    $('#toggle-controls').removeClass('hidden');
  }
}

// Authenticate with GCX
$(document).ready(() => {
  client
  .loginImplicitGrant(clientId, redirectUri)
  .then((data) => {
    // After successful authentication, load contents further
    bootstrap();
  })
  .catch((err) => {
    // Handle failure response
    console.error(err);
    bootstrapError();
  });
});

// Section: Bootstrap
function bootstrapError() {
  $('#loading').addClass('hidden');
  $('#auth-failure').removeClass('hidden');
}

async function bootstrap() {
  usersApi
    .getUsersMe()
    .then(async (data) => {
      agentId = data.id;
      await fetchAgentQueues(agentId)
      .then((data) => {
        agentQueues = data;
        relevantMediatypes = filterApplicableMediaTypes();
        renderQueueStatus();
        renderControls();
      })

      // show ui
      $('#loading').addClass('hidden');
      $('#main-app').removeClass('hidden');
    })
    .catch((err) => {
      console.error(err);
    });
}

// Function for fetching all agent queues from GCX API
async function fetchAgentQueues(agentId) {
  let result = [];

  // TODO: Implement proper paging
  const options = {
    pageSize: 100,
    pageNumber: 1
  }
  await usersApi.getUserQueues(agentId, options)
  .then((data) => {
    // console.log(`fetchAgentQueues success! data: ${JSON.stringify(data, null, 2)}`);
    result = data.entities;
  })
  .catch((err) => {
    console.log('There was a failure calling fetchAgentQueues');
    console.error(err);
  });
  return result;
}

// From the full list of agent queues, distill a list of applicable media types (voice, chat, email) with current assignment status
function filterApplicableMediaTypes() {
  let result = [];

  for (let idx = 0; idx < agentQueues.length; idx++) {
    const thisQueueName = agentQueues[idx].name
    const thisQueueJoinStatus = agentQueues[idx].joined

    // Queue name must be according to a naming convention consisting of different parts. Parts are divided with underscore:
    // - Part 1: country (code)
    // - Part 2: media type (single word)
    // - Part 3: department / topic / queue name (may include underscore characters as well)
    const queueNameParts = thisQueueName.split('_')
    if (queueNameParts.length >= 3) {
      const queueMediaType = queueNameParts[1].toLowerCase()
      if (supportedMediaTypes.hasOwnProperty(queueMediaType)) {
        const filteredMediaType = result.filter(mediaType => {
          return mediaType.mediaType == queueMediaType
        });

        if (filteredMediaType.length == 0) {
          result.push(
            { mediaType: queueMediaType,
              joinStatus: thisQueueJoinStatus
            });
        }
      }
    }
  }
  return result;
}

// 
async function updateQueueStatus(mediaType, newStatus) {
  console.log(`Updating [${mediaType}] queues to new status [${newStatus}] ...`);

  let newQueueStatusList = [];
  for (let idx = 0; idx < agentQueues.length; idx++) {
    const thisQueueName = agentQueues[idx].name
    const thisQueueId = agentQueues[idx].id

    // Queue name must be according to a naming convention consisting of different parts. Parts are divided with underscore:
    // - Part 1: country (code)
    // - Part 2: media type (single word)
    // - Part 3: department / topic / queue name (may include underscore characters as well)
    const queueNameParts = thisQueueName.split('_')
    if (queueNameParts.length >= 3) {
      const queueMediaType = queueNameParts[1].toLowerCase()
      if (queueMediaType == mediaType) {
        newQueueStatusList.push({
          id: thisQueueId,
          joined: newStatus
        });
      }
    }
  }

  await routingApi.patchUserQueues(agentId, newQueueStatusList)
  .then(async (data) => {
    // console.log('updateQueueStatus query executed successfully');

    await fetchAgentQueues(agentId)
    .then((data) => {
      agentQueues = data;
      renderQueueStatus();
    });
  })
  .catch((err) => {
    console.log('updateQueueStatus exception: ', err);
    console.log(err);
  });
}