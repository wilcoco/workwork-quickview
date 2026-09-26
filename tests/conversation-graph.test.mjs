import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConversation } from '../server/conversation.mjs';
import { buildBriefing } from '../server/briefing.mjs';

const question = {id:'q',text:'Can B17 ship?',status:'live'};
const request = {id:'r',questionId:'q',prompt:'What is the release state?',version:1,followups:[]};
const response = {id:'a',questionId:'q',requestId:'r',requestVersion:1,text:'Release is pending.',status:'blocked',authorId:'member',source:'QA record B17'};
const entry = (id, parentId, kind, extra = {}) => ({id,parentId,kind,questionId:'q',requestId:'r',text:id,authorId:'member',...extra});

test('exact historical parents survive updates and define discourse, not causal process', () => {
  const entries = [entry('f','a','question'),entry('detail','f','context'),entry('concern','a','concern'),entry('reply','f','answer')];
  const updated = {...response,id:'new',previousResponseId:'a',text:'Another report',status:'on_track'};
  const graph = buildConversation(question,[request],[response,updated],entries);
  assert.equal(graph.openQuestions.length,0);
  assert.equal(graph.concerns.length,1);
  assert.ok(graph.links.some(l=>l.sourceId==='f' && l.targetId==='a' && l.type==='follows_up'));
  assert.ok(!graph.links.some(l=>l.sourceId==='f' && l.targetId==='new'));
  assert.ok(graph.links.some(l=>l.sourceId==='reply' && l.targetId==='f' && l.type==='answers'));
  assert.ok(graph.links.every(l=>!['causes','prerequisite','verified'].includes(l.type)));
});

test('context, concerns and popularity cannot answer an assigned question or change business evidence', () => {
  const followup = entry('f','a','question',{assigneeId:'operator'});
  const reactions = ['u1','u2'].map((authorId,i)=>({id:'vote'+i,questionId:'q',targetId:'a',kind:'helpful',active:true,authorId}));
  reactions.push({...reactions[0],id:'off',active:false});
  const graph = buildConversation(question,[request],[response],[followup,entry('c','f','context'),entry('x','f','concern')],reactions);
  assert.deepEqual(graph.openQuestions,[followup]);
  assert.deepEqual(graph.helpfulByTarget.a,{count:1,userIds:['u2']});
  assert.equal(graph.concerns.length,1);
  assert.equal(buildBriefing(question,[request],[response]).rows[0].state,'blocked');
  assert.equal(graph.nodes.find(n=>n.id==='a').confidence,undefined);
});

test('projection excludes foreign scopes, dangling parents and cycles without losing valid deep threads', () => {
  const entries = [entry('cycle1','cycle2','context'),entry('cycle2','cycle1','context'),entry('orphan','missing','concern'),
    entry('wrong-scope','a','context',{questionId:'foreign'}), entry('wrong-request','a','context',{requestId:'other'}),
    entry('bad-answer','a','answer'),entry('deep','follow','context'),entry('follow','a','question')];
  const graph = buildConversation(question,[request],[response,{...response,id:'foreign-answer',questionId:'foreign'}],entries,
    [{id:'foreign-vote',questionId:'foreign',targetId:'a',kind:'helpful',active:true,authorId:'u'}]);
  assert.deepEqual(new Set(graph.nodes.map(n=>n.id)),new Set(['q','r','a','follow','deep']));
  assert.ok(graph.links.every(l=>graph.nodes.some(n=>n.id===l.sourceId) && graph.nodes.some(n=>n.id===l.targetId)));
  assert.equal(graph.openQuestions.length,1);
});

test('legacy clarifications and source-backed decisions retain exact recorded references', () => {
  const legacy = {...request,version:2,followups:[{id:'clarify',text:'Which inspector?',assigneeId:'member'}]};
  const revised = {...response,id:'revised',requestVersion:2,previousResponseId:'a'};
  const decision = {id:'d',questionId:'q',text:'Wait for release.',responseIds:['a','foreign']};
  const action = {id:'work',questionId:'q',decisionId:'d',title:'Obtain release reference'};
  const graph = buildConversation(question,[legacy],[response,revised],[],[],[decision],[action]);
  assert.ok(graph.links.some(l=>l.sourceId==='revised' && l.targetId==='clarify' && l.type==='answers'));
  assert.ok(graph.links.some(l=>l.sourceId==='d' && l.targetId==='a' && l.type==='based_on'));
  assert.ok(graph.links.some(l=>l.sourceId==='d' && l.targetId==='work' && l.type==='assigns'));
  assert.ok(!graph.nodes.some(n=>n.id==='foreign'));
});
