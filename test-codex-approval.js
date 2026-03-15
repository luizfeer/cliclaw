#!/usr/bin/env node
/**
 * Simulates the full exec_approval flow without Telegram or real Codex.
 * Creates a mock codex proto process via in-process streams and verifies
 * the exact JSON that cliclaw would send back.
 */
'use strict'

const { EventEmitter } = require('events')
const { randomUUID }   = require('crypto')

// ─── mock child process ───────────────────────────────────────────────────────
function makeMockProc() {
  const stdout = new EventEmitter()
  const stderr = new EventEmitter()
  const stdinWrites = []

  const proc = {
    stdout,
    stderr,
    stdin: {
      write(data) {
        stdinWrites.push(data)
        return true
      },
    },
    exitCode: null,
    kill()    {},
    on()      {},
  }

  return { proc, stdout, stdinWrites }
}

// ─── minimal re-implementation of the approval logic ─────────────────────────
// (mirrors src/agents/codex.ts handleProtoEvent + respond)
function handleApproval(proc, obj, decision) {
  const msgId      = obj.id
  const msg        = obj.msg
  if (msg?.type !== 'exec_approval_request') return null

  // mirrors codex.ts: effective_approval_id() = approval_id ?? call_id ?? sub_id ?? outer_id
  const approvalId = msg.approval_id ?? msg.call_id ?? msg.sub_id ?? msgId
  const turnId     = msg.turn_id

  const op = { type: 'exec_approval', id: approvalId, decision }
  if (turnId) op.turn_id = turnId

  proc.stdin.write(JSON.stringify({ id: randomUUID(), op }) + '\n')
}

// ─── test runner ──────────────────────────────────────────────────────────────
function runTest(name, incomingMsg, decision, expectFn) {
  const { proc, stdinWrites } = makeMockProc()
  handleApproval(proc, incomingMsg, decision)

  if (stdinWrites.length === 0) {
    console.error(`❌ [${name}] nothing written to stdin`)
    return false
  }

  let parsed
  try {
    parsed = JSON.parse(stdinWrites[0].trim())
  } catch (e) {
    console.error(`❌ [${name}] invalid JSON written:`, stdinWrites[0])
    return false
  }

  const result = expectFn(parsed)
  if (result === true) {
    console.log(`✅ [${name}]`)
    console.log('   sent:', JSON.stringify(parsed))
    return true
  } else {
    console.error(`❌ [${name}] assertion failed:`, result)
    console.error('   sent:', JSON.stringify(parsed))
    return false
  }
}

// ─── test cases ───────────────────────────────────────────────────────────────
const SUB_ID = 'call_Bb3abNkDtdHBZWSVSVFTd3Te'
const MSG_ID = randomUUID()

const incomingApprovalRequest = {
  id:  MSG_ID,
  msg: {
    type:    'exec_approval_request',
    sub_id:  SUB_ID,
    command: { type: 'shell', command: ['systeminfo'] },
  },
}

let allPassed = true

allPassed &= runTest(
  'approve — has outer id',
  incomingApprovalRequest, 'approved',
  (r) => typeof r.id === 'string' && r.id.length > 0 || `missing outer id, got: ${r.id}`
)

allPassed &= runTest(
  'approve — has op field (not jsonrpc result)',
  incomingApprovalRequest, 'approved',
  (r) => r.op != null || `missing op field, got: ${JSON.stringify(r)}`
)

allPassed &= runTest(
  'approve — op.type is exec_approval',
  incomingApprovalRequest, 'approved',
  (r) => r.op?.type === 'exec_approval' || `wrong op.type: ${r.op?.type}`
)

allPassed &= runTest(
  'approve — op.id equals call_id/approval_id (not sub_id field)',
  incomingApprovalRequest, 'approved',
  (r) => r.op?.id === SUB_ID || `op.id should be "${SUB_ID}", got: ${r.op?.id} (sub_id=${r.op?.sub_id})`
)

allPassed &= runTest(
  'approve — decision is "approved"',
  incomingApprovalRequest, 'approved',
  (r) => r.op?.decision === 'approved' || `wrong decision: ${r.op?.decision}`
)

allPassed &= runTest(
  'deny — decision is "denied"',
  incomingApprovalRequest, 'denied',
  (r) => r.op?.decision === 'denied' || `wrong decision: ${r.op?.decision}`
)

allPassed &= runTest(
  'abort — decision is "abort"',
  incomingApprovalRequest, 'abort',
  (r) => r.op?.decision === 'abort' || `wrong decision: ${r.op?.decision}`
)

allPassed &= runTest(
  'approved_for_session — decision passed through',
  incomingApprovalRequest, 'approved_for_session',
  (r) => r.op?.decision === 'approved_for_session' || `wrong decision: ${r.op?.decision}`
)

// ─── fallback: msg uses call_id instead of sub_id ────────────────────────────
const incomingWithCallId = {
  id:  MSG_ID,
  msg: {
    type:    'exec_approval_request',
    call_id: SUB_ID,
    command: ['ls', '-la'],
  },
}

allPassed &= runTest(
  'call_id fallback — op.id equals call_id',
  incomingWithCallId, 'approved',
  (r) => r.op?.id === SUB_ID || `op.id should be "${SUB_ID}", got: ${r.op?.id}`
)

// ─── approval_id takes priority over call_id ─────────────────────────────────
const APPROVAL_ID = 'approval_XyZ987'
const incomingWithApprovalId = {
  id:  MSG_ID,
  msg: {
    type:        'exec_approval_request',
    call_id:     SUB_ID,
    approval_id: APPROVAL_ID,
    turn_id:     'turn_abc',
    command:     ['systeminfo'],
  },
}

allPassed &= runTest(
  'approval_id takes priority over call_id',
  incomingWithApprovalId, 'approved',
  (r) => r.op?.id === APPROVAL_ID || `op.id should be "${APPROVAL_ID}", got: ${r.op?.id}`
)

allPassed &= runTest(
  'turn_id included when present in request',
  incomingWithApprovalId, 'approved',
  (r) => r.op?.turn_id === 'turn_abc' || `op.turn_id should be "turn_abc", got: ${r.op?.turn_id}`
)

allPassed &= runTest(
  'turn_id omitted when not in request',
  incomingApprovalRequest, 'approved',
  (r) => r.op?.turn_id === undefined || `op.turn_id should be absent, got: ${r.op?.turn_id}`
)

console.log('')
console.log(allPassed ? '✅ All tests passed' : '❌ Some tests FAILED')
process.exit(allPassed ? 0 : 1)
