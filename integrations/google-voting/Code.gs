/* One standalone Apps Script per voting activity. No respondent identity leaves Google.
 * Script Properties: ACTIVITY_ID, FORM_ID, SYNC_URL, SYNC_KEY, CONTROL_KEY.
 * Optional BOOTSTRAP_JSON for createTestVotingForm(); no secrets in source code.
 */
function properties_() { return PropertiesService.getScriptProperties(); }
function hex_(bytes) { return bytes.map(function (value) { return ('0' + ((value + 256) % 256).toString(16)).slice(-2); }).join(''); }
function signature_(timestamp, payload, key, purpose) {
  return hex_(Utilities.computeHmacSha256Signature('gallery-vote-' + purpose + '-v1\n' + timestamp + '\n' + payload, key, Utilities.Charset.UTF_8));
}
function sign_(payload, key, purpose) {
  var timestamp = Date.now(), body = JSON.stringify(payload);
  return { timestamp: timestamp, payload: body, signature: signature_(timestamp, body, key, purpose) };
}
function verify_(envelope, key, purpose) {
  if (!key || !/^[0-9a-f]{64}$/.test(key) || !envelope || Object.keys(envelope).sort().join(',') !== 'payload,signature,timestamp' || !Number.isSafeInteger(envelope.timestamp) || Math.abs(Date.now() - envelope.timestamp) > 300000 || typeof envelope.payload !== 'string' || envelope.payload.length > 60000 || !/^[0-9a-f]{64}$/.test(envelope.signature || '')) throw new Error('Invalid signature');
  var expected = signature_(envelope.timestamp, envelope.payload, key, purpose), mismatch = 0;
  for (var index = 0; index < expected.length; index++) mismatch |= expected.charCodeAt(index) ^ envelope.signature.charCodeAt(index);
  if (mismatch) throw new Error('Invalid signature');
  return JSON.parse(envelope.payload);
}
function output_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function withLock_(task) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Voting source busy; retry later');
  try { return task(); } finally { lock.releaseLock(); }
}
function cachedConfig_() {
  var props = properties_(), size = Number(props.getProperty('CONFIG_PARTS') || 0), value = '';
  for (var index = 0; index < size; index++) value += props.getProperty('CONFIG_' + index) || '';
  return value ? JSON.parse(value) : null;
}
function adoptConfig_(config) {
  var props = properties_(), previous = cachedConfig_();
  if (!config || config.activityId !== props.getProperty('ACTIVITY_ID') || config.formId !== props.getProperty('FORM_ID') || !Number.isSafeInteger(config.revision) || config.revision < 1 || !/^[0-9a-f]{64}$/.test(config.mappingVersion)) throw new Error('Source binding mismatch');
  if (previous && (config.revision < previous.revision || config.mappingVersion !== previous.mappingVersion)) throw new Error('Stale command or changed mapping');
  var body = JSON.stringify(config), values = {}, parts = Math.ceil(body.length / 1500);
  for (var index = 0; index < parts; index++) values['CONFIG_' + index] = body.slice(index * 1500, (index + 1) * 1500);
  values.CONFIG_PARTS = String(parts); props.setProperties(values);
  return config;
}
function assertForm_(form, config) {
  if (!form.hasLimitOneResponsePerUser() || form.collectsEmail() || form.canEditResponse() || form.isPublishingSummary() || form.isQuiz()) throw new Error('Unsafe form settings');
  if (form.getPublishedUrl() !== config.formUrl) throw new Error('Responder URL mismatch');
  // An independent voting form has exactly one question; no name/email/upload fields.
  var items = form.getItems(), expectedType = config.maxChoices === 1 ? FormApp.ItemType.MULTIPLE_CHOICE : FormApp.ItemType.CHECKBOX;
  if (items.length !== 1 || String(items[0].getId()) !== config.questionItemId || items[0].getType() !== expectedType) throw new Error('Voting question mismatch');
  var question = config.maxChoices === 1 ? items[0].asMultipleChoiceItem() : items[0].asCheckboxItem();
  if (!question.isRequired() || question.hasOtherOption()) throw new Error('Voting question must be required with no other option');
  var actual = question.getChoices().map(function (choice) { return choice.getValue(); });
  var expected = config.entries.map(function (entry) { return entry.code + '｜' + entry.title; });
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Voting choices mismatch');
}
function applyAcceptance_(form, config) {
  var now = Date.now(), accepting = Boolean(config.acceptanceDesired && !config.finalVersion && now >= Date.parse(config.voteStartsAt) && now < Date.parse(config.voteEndsAt));
  if (accepting && form.supportsAdvancedResponderPermissions() && !form.isPublished()) form.setPublished(true);
  form.setAcceptingResponses(accepting);
  if (form.isAcceptingResponses() !== accepting) throw new Error('Acceptance not confirmed');
}
// Pure recount core, shared by the real source and deterministic Node tests.
// IDs are deduplicated inside Apps Script only, never included in the signed summary.
function recount_(responses, config) {
  var seen = new Set(), counts = {}, ballotCount = 0, selectionCount = 0, invalidCount = 0, excludedCount = 0;
  var byLabel = new Map(config.entries.map(function (entry) { counts[entry.workId] = 0; return [entry.code + '｜' + entry.title, entry.workId]; }));
  responses.forEach(function (response) {
    if (!response.id || seen.has(response.id)) { invalidCount++; return; }
    seen.add(response.id);
    var time = Date.parse(response.timestamp);
    if (!Number.isFinite(time)) { invalidCount++; return; }
    if (time < Date.parse(config.voteStartsAt) || time >= Date.parse(config.voteEndsAt)) { excludedCount++; return; }
    var labels = Array.isArray(response.answer) ? response.answer : [response.answer];
    if (!labels.length || labels.length > config.maxChoices || new Set(labels).size !== labels.length || labels.some(function (label) { return !byLabel.has(label); })) { invalidCount++; return; }
    ballotCount++; selectionCount += labels.length;
    labels.forEach(function (label) { counts[byLabel.get(label)]++; });
  });
  return { countsByWorkId: counts, ballotCount: ballotCount, selectionCount: selectionCount, invalidCount: invalidCount, excludedCount: excludedCount };
}
function fullSummary_(config, jobId) {
  var form = FormApp.openById(properties_().getProperty('FORM_ID'));
  // Closing must still happen if someone changed the form to an unsafe schema.
  if (!config.acceptanceDesired || config.finalVersion || Date.now() >= Date.parse(config.voteEndsAt) || Date.now() < Date.parse(config.voteStartsAt)) form.setAcceptingResponses(false);
  assertForm_(form, config); applyAcceptance_(form, config);
  var responses = form.getResponses().map(function (response) {
    var item = response.getItemResponses().find(function (answer) { return String(answer.getItem().getId()) === config.questionItemId; });
    return { id: response.getId(), timestamp: response.getTimestamp().toISOString(), answer: item ? item.getResponse() : [] };
  });
  var stats = recount_(responses, config), props = properties_(), revision = Number(props.getProperty('SOURCE_REVISION') || 0) + 1;
  if (!Number.isSafeInteger(revision)) throw new Error('Invalid source revision');
  props.setProperty('SOURCE_REVISION', String(revision));
  return Object.assign({ action: 'summary', activityId: config.activityId, jobId: jobId, sourceRevision: revision, configRevision: config.revision, mappingVersion: config.mappingVersion, sourceGeneratedAt: new Date().toISOString(), formId: config.formId, questionItemId: config.questionItemId, formUrl: config.formUrl, acceptingResponses: form.isAcceptingResponses(), schemaVerified: true }, stats);
}
function syncRequest_(payload) {
  var props = properties_(), url = props.getProperty('SYNC_URL'), key = props.getProperty('SYNC_KEY');
  if (!/^https:\/\/[a-z0-9.-]+\/api\/vote-sync$/.test(url || '')) throw new Error('Set a public HTTPS SYNC_URL');
  var response = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(sign_(payload, key, 'sync')), followRedirects: false, muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) throw new Error('Gallery sync rejected: ' + response.getResponseCode());
  return verify_(JSON.parse(response.getContentText()), key, 'sync-reply');
}
function syncVoting() {
  return withLock_(function () {
    var props = properties_(), previous = cachedConfig_();
    // Close on the cached deadline even when the website is temporarily unavailable.
    if (previous && (!previous.acceptanceDesired || previous.finalVersion || Date.now() >= Date.parse(previous.voteEndsAt))) FormApp.openById(props.getProperty('FORM_ID')).setAcceptingResponses(false);
    var config = adoptConfig_(syncRequest_({ action: 'configuration', activityId: props.getProperty('ACTIVITY_ID') }).configuration);
    try { return syncRequest_(fullSummary_(config, Utilities.getUuid())); }
    catch (error) {
      var failureRevision = Number(props.getProperty('SOURCE_REVISION') || 0) + 1;
      props.setProperty('SOURCE_REVISION', String(failureRevision));
      try { syncRequest_({ action: 'failure', activityId: config.activityId, jobId: Utilities.getUuid(), configRevision: config.revision, mappingVersion: config.mappingVersion, sourceRevision: failureRevision, sourceGeneratedAt: new Date().toISOString() }); } catch (unavailable) { console.error('Voting failure report unavailable'); }
      throw new Error('Voting sync unavailable; check form settings and connectivity');
    }
  });
}
function onVotingSubmit() { return syncVoting(); }
function doPost(event) {
  try {
    var props = properties_(), command = verify_(JSON.parse(event.postData.contents), props.getProperty('CONTROL_KEY'), 'control');
    if (command.action !== 'reconcile' || command.activityId !== props.getProperty('ACTIVITY_ID') || !/^[0-9a-f-]{36}$/i.test(command.jobId || '')) throw new Error('Invalid command');
    return withLock_(function () {
      var config = adoptConfig_(command.configuration), summary;
      if (props.getProperty('CONTROL_JOB_ID') === command.jobId) {
        var body = '', parts = Number(props.getProperty('CONTROL_PARTS') || 0);
        for (var index = 0; index < parts; index++) body += props.getProperty('CONTROL_' + index) || '';
        summary = JSON.parse(body);
      } else {
        summary = fullSummary_(config, command.jobId);
        var body = JSON.stringify(summary), values = {}, parts = Math.ceil(body.length / 1500);
        for (var index = 0; index < parts; index++) values['CONTROL_' + index] = body.slice(index * 1500, (index + 1) * 1500);
        values.CONTROL_PARTS = String(parts); values.CONTROL_JOB_ID = command.jobId; props.setProperties(values);
      }
      return output_(sign_(summary, props.getProperty('CONTROL_KEY'), 'control-reply'));
    });
  } catch (error) {
    // Never return stack traces, signed commands, respondent data or keys.
    console.error('Voting control failed');
    return output_({ error: 'Voting source unavailable' });
  }
}
function doGet() { return output_({ error: 'POST required' }); }
function installVotingTriggers() {
  var form = FormApp.openById(properties_().getProperty('FORM_ID'));
  ScriptApp.getProjectTriggers().filter(function (trigger) { return ['onVotingSubmit', 'syncVoting'].indexOf(trigger.getHandlerFunction()) !== -1; }).forEach(function (trigger) { ScriptApp.deleteTrigger(trigger); });
  ScriptApp.newTrigger('onVotingSubmit').forForm(form).onFormSubmit().create();
  ScriptApp.newTrigger('syncVoting').timeBased().everyMinutes(5).create();
}
function inspectVotingForm() {
  var form = FormApp.openById(properties_().getProperty('FORM_ID'));
  console.log(JSON.stringify({ formId: form.getId(), formUrl: form.getPublishedUrl(), items: form.getItems().map(function (item) { return { questionItemId: String(item.getId()), title: item.getTitle() }; }) }));
}
function createTestVotingForm() {
  // Explicitly run once by the form owner; never called by public requests/triggers.
  var props = properties_(); if (props.getProperty('FORM_ID')) throw new Error('A form is already bound');
  var setupText = props.getProperty('BOOTSTRAP_JSON') || '';
  for (var index = 0; !props.getProperty('BOOTSTRAP_JSON') && props.getProperty('BOOTSTRAP_' + index); index++) setupText += props.getProperty('BOOTSTRAP_' + index);
  var setup = JSON.parse(setupText || '{}');
  if (!setup.title || !setup.activityId || !Array.isArray(setup.entries) || setup.entries.length < 2 || !Number.isInteger(setup.maxChoices) || setup.maxChoices < 1 || setup.maxChoices > 5) throw new Error('Set BOOTSTRAP_JSON first');
  var form = FormApp.create(setup.title);
  // Save the binding before further mutations so retries cannot create duplicate forms.
  props.setProperties({ FORM_ID: form.getId(), ACTIVITY_ID: setup.activityId });
  if (form.supportsAdvancedResponderPermissions()) form.setPublished(false);
  form.setCollectEmail(false).setLimitOneResponsePerUser(true).setAllowResponseEdits(false).setPublishingSummary(false).setShowLinkToRespondAgain(false).setIsQuiz(false);
  form.setDescription('每個 Google 帳號限提交一次；不收集姓名與電子郵件。每票最多選 ' + setup.maxChoices + ' 件作品。').setCustomClosedFormMessage('目前尚未開放或已停止投票。').setConfirmationMessage('投票已送出，網站統計將在同步後更新。');
  var question = setup.maxChoices === 1 ? form.addMultipleChoiceItem() : form.addCheckboxItem();
  question.setTitle('選出你喜愛的作品').setChoiceValues(setup.entries.map(function (entry) { return entry.code + '｜' + entry.title; })).setRequired(true).showOtherOption(false);
  if (setup.maxChoices > 1) question.setValidation(FormApp.createCheckboxValidation().requireSelectAtMost(setup.maxChoices).build());
  form.setAcceptingResponses(false);
  var sheet = SpreadsheetApp.create(setup.title + '（私人回覆）'); form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());
  console.log(JSON.stringify({ formId: form.getId(), formUrl: form.getPublishedUrl(), questionItemId: String(question.getId()), sheetUrl: sheet.getUrl() }));
}
